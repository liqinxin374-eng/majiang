import crypto from 'node:crypto';

export function createWebSocketAccept(clientKey) {
    return crypto
        .createHash('sha1')
        .update(`${clientKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
}

/**
 * 把应用消息编码成服务器→客户端的 WebSocket 文本帧。
 *
 * 旧实现在 payload >= 126 字节时直接 throw，导致一广播真实四人麻将房间状态
 * （gameState 远超 125 字节）服务端就崩。现在按 RFC 6455 正确支持 16 位 / 64 位
 * 扩展长度，单帧可承载任意大小的 JSON。
 *
 * 服务端发出的帧**不得**带掩码（RFC 6455 §5.1）。
 *
 * @param {unknown} message 会被 JSON.stringify 的对象
 * @returns {Buffer} 完整 WebSocket 帧（可直接用于 socket.write / broadcast）
 */
export function encodeWebSocketText(message) {
    return encodeFrame(0x1, Buffer.from(JSON.stringify(message)));
}

// 编码单帧。opcode：0x1 文本 / 0x8 关闭 / 0x9 ping / 0xA pong。
// 服务端帧永不加掩码。
function encodeFrame(opcode, payload) {
    const length = payload.length;
    let header;
    if (length < 126) {
        header = Buffer.alloc(2);
        header[1] = length;
    } else if (length < 65536) {
        header = Buffer.alloc(4);
        header[1] = 126;
        header.writeUInt16BE(length, 2);
    } else {
        header = Buffer.alloc(10);
        header[1] = 127;
        // 64 位大端长度；先把高 32 位和低 32 位分别写入
        header.writeUInt32BE(Math.floor(length / 4294967296), 2);
        header.writeUInt32BE(length >>> 0, 6);
    }
    header[0] = 0x80 | opcode; // FIN 置位 + opcode
    return Buffer.concat([header, payload]);
}

// 控制帧（ping/pong/close）辅助编码，payload 不得超过 125 字节。
function encodeControlFrame(opcode, payload = Buffer.alloc(0)) {
    return encodeFrame(opcode, payload);
}

/**
 * 从缓冲区解析一个完整帧。
 *
 * 支持：扩展长度 126 / 127、客户端→服务器掩码、多帧粘连、跨 TCP 分片的不完整帧。
 * 帧未收全时返回 null，调用方保留 `rest` 到下一次 data 事件再拼。
 *
 * @param {Buffer} buffer
 * @returns {{ frame: { fin: boolean, opcode: number, masked: boolean, payload: Buffer }, rest: Buffer } | null}
 */
function parseFrame(buffer) {
    if (buffer.length < 2) return null;
    const b0 = buffer[0];
    const b1 = buffer[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let length = b1 & 0x7f;
    let offset = 2;
    if (length === 126) {
        if (buffer.length < offset + 2) return null;
        length = buffer.readUInt16BE(offset);
        offset += 2;
    } else if (length === 127) {
        if (buffer.length < offset + 8) return null;
        const high = buffer.readUInt32BE(offset);
        const low = buffer.readUInt32BE(offset + 4);
        length = high * 4294967296 + low;
        offset += 8;
    }
    let maskKey = null;
    if (masked) {
        if (buffer.length < offset + 4) return null;
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
    }
    if (buffer.length < offset + length) return null; // 帧还没收全
    let payload = buffer.subarray(offset, offset + length);
    if (masked) {
        const unmasked = Buffer.alloc(length);
        for (let index = 0; index < length; index++) unmasked[index] = payload[index] ^ maskKey[index % 4];
        payload = unmasked;
    }
    return { frame: { fin, opcode, masked, payload }, rest: buffer.subarray(offset + length) };
}

export function attachWebSocketServer(server, onMessage) {
    const clients = new Set();

    server.on('upgrade', (request, socket) => {
        if (request.url !== '/ws' || request.headers.upgrade?.toLowerCase() !== 'websocket') {
            socket.destroy();
            return;
        }
        const clientKey = request.headers['sec-websocket-key'];
        if (!clientKey) return socket.destroy();
        socket.write([
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${createWebSocketAccept(clientKey)}`,
            '', ''
        ].join('\r\n'));
        clients.add(socket);
        socket._wsBuffer = Buffer.alloc(0);
        socket._fragmentOpcode = null;
        socket._fragments = null;
        socket.write(encodeWebSocketText({ type: 'connected', message: '实时连接已建立。' }));

        // TCP 可能把一帧拆成多个 data 事件，也可能把多帧合并到一个 data 事件。
        // 这里用缓冲累加 + 循环解析，直到没有完整帧为止。
        socket.on('data', buffer => {
            socket._wsBuffer = socket._wsBuffer.length ? Buffer.concat([socket._wsBuffer, buffer]) : buffer;
            let parsed;
            while ((parsed = parseFrame(socket._wsBuffer))) {
                socket._wsBuffer = parsed.rest;
                handleFrame(parsed.frame, socket);
            }
        });

        function handleFrame(frame, sender) {
            // 控制帧：必须立即处理，且不得被分片（RFC 6455 §5.4/§5.5）
            if (frame.opcode === 0x8) { // close
                sender.write(encodeControlFrame(0x8, frame.payload.subarray(0, 2)));
                sender.end();
                return;
            }
            if (frame.opcode === 0x9) { // ping → 必须回 pong
                sender.write(encodeControlFrame(0xA, frame.payload));
                return;
            }
            if (frame.opcode === 0xA) { // pong → 忽略
                return;
            }
            // 数据帧：0x1 文本 / 0x2 二进制 / 0x0 续帧
            if (frame.opcode === 0x1 || frame.opcode === 0x2) {
                if (!frame.fin) {
                    sender._fragmentOpcode = frame.opcode;
                    sender._fragments = [frame.payload];
                    return;
                }
                deliver(frame.opcode, frame.payload, sender);
                return;
            }
            if (frame.opcode === 0x0) { // 分片续帧
                if (!sender._fragments) { // 没有前缀分片却来了续帧 → 协议错误
                    sender.write(encodeControlFrame(0x8, Buffer.from([0x03, 0xea]))); // 1002 protocol error
                    sender.end();
                    return;
                }
                sender._fragments.push(frame.payload);
                if (frame.fin) {
                    const opcode = sender._fragmentOpcode;
                    const full = Buffer.concat(sender._fragments);
                    sender._fragments = null;
                    sender._fragmentOpcode = null;
                    deliver(opcode, full, sender);
                }
            }
        }

        function deliver(opcode, payload, sender) {
            if (opcode === 0x2) return; // 应用层只用文本帧
            const text = payload.toString('utf8');
            try {
                onMessage(JSON.parse(text), sender, clients);
            } catch (error) {
                sender.write(encodeWebSocketText({ type: 'error', message: error.message || '消息格式必须是 JSON。' }));
            }
        }

        // 防止底层 TCP 异常（如客户端异常断开）在没有监听器时变成未捕获异常，
        // 进而导致整台 server / 测试进程崩溃。这里只做清理，不抛。
        socket.on('close', () => clients.delete(socket));
        socket.on('error', () => clients.delete(socket));
    });

    return {
        // 接口语义保持不变：向全部 client 广播（shouldSend 过滤），编码只做一次。
        broadcast(message, shouldSend = () => true) {
            const frame = encodeWebSocketText(message);
            clients.forEach(client => client.writable && shouldSend(client) && client.write(frame));
        },

        /**
         * 逐个遍历在线连接，让调用方能给每个人发「不同内容」。
         * 麻将必须按人裁剪手牌，做不到一份消息群发，所以需要这个入口。
         */
        forEachClient(visit) {
            clients.forEach(client => { if (client.writable) visit(client); });
        }
    };
}
