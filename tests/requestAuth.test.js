import test from 'node:test';
import assert from 'node:assert/strict';
import { requireBoundRoomPlayer } from '../server/requestAuth.js';

test('realtime requests must use the player and room bound to their socket', () => {
    const socket = { roomNumber: '100001', playerId: 'player-a' };
    assert.doesNotThrow(() => requireBoundRoomPlayer(socket, { roomNumber: '100001', playerId: 'player-a' }));
    assert.throws(() => requireBoundRoomPlayer(socket, { roomNumber: '100002', playerId: 'player-a' }), /跨房间/);
    assert.throws(() => requireBoundRoomPlayer(socket, { roomNumber: '100001', playerId: 'player-b' }), /冒充/);
    assert.throws(() => requireBoundRoomPlayer({}, { roomNumber: '100001', playerId: 'player-a' }), /请先创建/);
});
