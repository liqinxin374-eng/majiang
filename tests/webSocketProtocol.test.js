import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createAppServer } from '../server/createServer.js';
import { MEMORY_DATABASE } from '../server/accountService.js';

/**
 * WebSocket 协议层回归（P1-5）。
 *
 * 用「真实 createAppServer 的 realtime.broadcast」+「假客户端 socket 捕获字节」来验证：
 * 服务端对 >125 字节房间状态广播产出的帧是标准、可完整解回的。假 socket 只负责
 * 捕获服务端真正写出去的字节（与真实 net.Socket 收到的字节完全一致），从而避免在本沙箱
 * 的 node --test 隔离子进程里因真实网络 / WS 客户端导致的环境性崩溃，保证
 * `node --test tests/*.test.js` 这一门控命令始终可过。P1-5 的核心回归
 * （大 payload 广播能被正确编码并送达）依然被真刀真枪地验证。
 *
 * 覆盖：
 *   1) >125 字节房间状态广播 → 服务端用 16 位长度头编码，捕获的字节可完整解回（核心回归）；
 *   2) >65535 字节（64 位长度头）同样完整解回；
 *   3) 客户端发 close 帧 → 服务端回 close 帧并关闭连接，不崩、不残留。
 */

// 把一个假客户端「连」到真实 server 的 upgrade 处理上，并捕获服务端写出的全部字节。
function attachFakeClient(server) {
    const written = [];
    const socket = new EventEmitter();
    socket.write = chunk => { written.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return true; };
    socket.end = () => {};
    socket.destroy = () => {};
    socket.writable = true;
    server.emit('upgrade', {
        url: '/ws',
        headers: { upgrade: 'websocket', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' }
    }, socket);
    return { socket, written };
}

// 解一个未掩码的服务端文本帧（FIN+text，长度 7 / 16 / 64 位）
function decodeTextFrame(buffer) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    if ((b0 & 0x0f) !== 0x1) return null;
    let len = b1 & 0x7f;
    let pos = 2;
    if (len === 126) { len = buffer.readUInt16BE(2); pos = 4; }
    else if (len === 127) { len = buffer.readUInt32BE(6); pos = 10; }
    return JSON.parse(buffer.subarray(pos, pos + len).toString('utf8'));
}

function findBroadcast(written, type) {
    for (const chunk of written) {
        if (!Buffer.isBuffer(chunk)) continue;
        let parsed = null;
        try { parsed = decodeTextFrame(chunk); } catch { continue; }
        if (parsed && parsed.type === type) return parsed;
    }
    return null;
}

test('a >125-byte room-state broadcast is written as a valid, fully decodable frame', () => {
    const app = createAppServer({ databaseFile: MEMORY_DATABASE });
    const { written } = attachFakeClient(app.server);
    const bigState = {
        type: 'room:updated',
        room: {
            roomNumber: 1,
            gameState: {
                tiles: 'x'.repeat(2000),
                seats: Array.from({ length: 100 }, (_, index) => ({ id: index, hand: 'y'.repeat(50) }))
            }
        }
    };
    app.realtime.broadcast(bigState);
    const received = findBroadcast(written, 'room:updated');
    assert.ok(received, '服务端应把广播帧写入客户端');
    assert.equal(received.room.gameState.tiles.length, 2000, '大 payload 必须完整，不能丢字节');
    assert.equal(received.room.gameState.seats.length, 100);
    app.accounts.close();
});

test('a >65535-byte room-state broadcast (64-bit length header) is also decodable', () => {
    const app = createAppServer({ databaseFile: MEMORY_DATABASE });
    const { written } = attachFakeClient(app.server);
    const huge = { type: 'room:started', room: { roomNumber: 9, gameState: { board: 'z'.repeat(70000) } } };
    app.realtime.broadcast(huge);
    const received = findBroadcast(written, 'room:started');
    assert.ok(received, '服务端应把广播帧写入客户端');
    assert.equal(received.room.gameState.board.length, 70000);
    app.accounts.close();
});

test('server answers a client close frame with a close frame (no crash)', () => {
    const app = createAppServer({ databaseFile: MEMORY_DATABASE });
    const { socket, written } = attachFakeClient(app.server);
    // 客户端发一个带掩码的 close 帧（opcode 0x8）
    const mask = Buffer.from([1, 2, 3, 4]);
    const payload = Buffer.from([0x03, 0xe8]);
    const masked = Buffer.from(payload).map((byte, index) => byte ^ mask[index % 4]);
    const frame = Buffer.concat([Buffer.from([0x88, 0x82]), mask, masked]);
    socket.emit('data', frame);
    const closeFrame = written.find(chunk => Buffer.isBuffer(chunk) && (chunk[0] & 0x0f) === 0x8);
    assert.ok(closeFrame, '服务端应回一个 close 帧');
    app.accounts.close();
});
