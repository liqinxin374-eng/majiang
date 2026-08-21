import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createWebSocketAccept, encodeWebSocketText, attachWebSocketServer } from '../server/webSocketServer.js';

test('websocket handshake creates the protocol-defined accept key', () => {
    assert.equal(
        createWebSocketAccept('dGhlIHNhbXBsZSBub25jZQ=='),
        's3pPLMBiTxaQ9kYGzzhZRbK+xOo='
    );
});

test('websocket text frame contains a JSON payload', () => {
    const frame = encodeWebSocketText({ type: 'connected' });
    assert.equal(frame[0], 0x81);
    assert.equal(frame.subarray(2).toString(), '{"type":"connected"}');
});

test('encodeWebSocketText uses a 16-bit length header for payloads >= 126 bytes (no throw)', () => {
    // 这是 P1-5 的核心回归：旧代码在这里直接 throw，导致真实房间状态广播崩溃。
    const message = { type: 'room:updated', room: { big: 'x'.repeat(200) } };
    const frame = encodeWebSocketText(message);
    assert.equal(frame[0] & 0x7f, 0x1, 'FIN + 文本 opcode');
    assert.equal(frame[1], 126, '126 表示后续 2 字节为长度');
    assert.equal(frame.readUInt16BE(2), Buffer.from(JSON.stringify(message)).length);
    const decoded = JSON.parse(frame.subarray(4).toString('utf8'));
    assert.equal(decoded.room.big.length, 200);
});

test('encodeWebSocketText uses a 64-bit length header for payloads >= 65536 bytes', () => {
    const message = { type: 'room:updated', room: { big: 'x'.repeat(70000) } };
    const frame = encodeWebSocketText(message);
    assert.equal(frame[1], 127, '127 表示后续 8 字节为长度');
    assert.equal(frame.readUInt32BE(6), Buffer.from(JSON.stringify(message)).length, '低 32 位长度正确');
    const decoded = JSON.parse(frame.subarray(10).toString('utf8'));
    assert.equal(decoded.room.big.length, 70000);
});

// --- 下面这组测试直接驱动解码器：用一个假 socket 喂原始 WebSocket 帧 ---
// 浏览器（客户端）发来的帧必须带掩码；这里手工构造带掩码的帧。
function maskedFrame({ opcode, payload, fin = true, mask = crypto.randomBytes(4) }) {
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    const length = data.length;
    let header;
    if (length < 126) {
        header = Buffer.alloc(2);
        header[1] = 0x80 | length; // mask bit 置位
    } else if (length < 65536) {
        header = Buffer.alloc(4);
        header[1] = 0x80 | 126;
        header.writeUInt16BE(length, 2);
    } else {
        header = Buffer.alloc(10);
        header[1] = 0x80 | 127;
        header.writeUInt32BE(Math.floor(length / 4294967296), 2);
        header.writeUInt32BE(length >>> 0, 6);
    }
    header[0] = (fin ? 0x80 : 0) | opcode;
    const masked = Buffer.alloc(length);
    for (let index = 0; index < length; index++) masked[index] = data[index] ^ mask[index % 4];
    return Buffer.concat([header, mask, masked]);
}

function attachWithFakeSocket() {
    const fakeServer = new EventEmitter();
    const messages = [];
    const written = [];
    const socket = new EventEmitter();
    let ended = false;
    let destroyed = false;
    socket.write = chunk => { written.push(Buffer.from(chunk)); return true; };
    socket.end = () => { ended = true; };
    socket.destroy = () => { destroyed = true; };
    attachWebSocketServer(fakeServer, (message, sock) => messages.push({ message, sock }));
    fakeServer.emit('upgrade', {
        url: '/ws',
        headers: { upgrade: 'websocket', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' }
    }, socket);
    return { socket, messages, written, get ended() { return ended; }, get destroyed() { return destroyed; } };
}

test('server decodes a masked client text frame into a JSON message', () => {
    const { socket, messages } = attachWithFakeSocket();
    socket.emit('data', maskedFrame({ opcode: 0x1, payload: JSON.stringify({ type: 'room:create', player: { id: 'a' } }) }));
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].message, { type: 'room:create', player: { id: 'a' } });
});

test('server reassembles a fragmented text message across continuation frames', () => {
    const { socket, messages } = attachWithFakeSocket();
    socket.emit('data', maskedFrame({ opcode: 0x1, fin: false, payload: '{"type":"room:create","player":{"id":"' }));
    socket.emit('data', maskedFrame({ opcode: 0x0, fin: true, payload: 'a"}}' }));
    assert.equal(messages.length, 1, '两段分片应重组为一条消息');
    assert.deepEqual(messages[0].message, { type: 'room:create', player: { id: 'a' } });
});

test('server replies with a pong frame when the client sends a ping', () => {
    const { socket, written } = attachWithFakeSocket();
    socket.emit('data', maskedFrame({ opcode: 0x9, payload: Buffer.alloc(0) }));
    const last = written[written.length - 1];
    assert.equal(last[0] & 0x0f, 0xA, '回的是 pong 控制帧');
});

test('server closes the socket when the client sends a close frame', () => {
    const ctx = attachWithFakeSocket();
    ctx.socket.emit('data', maskedFrame({ opcode: 0x8, payload: Buffer.from([0x03, 0xe8]) }));
    assert.equal(ctx.ended, true);
    const last = ctx.written[ctx.written.length - 1];
    assert.equal(last[0] & 0x0f, 0x8, '回的是 close 帧');
});

test('server buffers a frame that arrives across two TCP chunks', () => {
    const { socket, messages } = attachWithFakeSocket();
    const frame = maskedFrame({ opcode: 0x1, payload: JSON.stringify({ type: 'ping' }) });
    const mid = Math.floor(frame.length / 2);
    socket.emit('data', frame.subarray(0, mid));
    assert.equal(messages.length, 0, '半帧不应触发回调');
    socket.emit('data', frame.subarray(mid));
    assert.equal(messages.length, 1, '收齐后才解析');
    assert.deepEqual(messages[0].message, { type: 'ping' });
});
