import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomService } from '../server/roomService.js';

const player = (id) => ({ id, name: `玩家${id}` });

function createPlayingRoom() {
    const rooms = new RoomService();
    const room = rooms.createRoom(player('a'));
    ['b', 'c', 'd'].forEach(id => rooms.joinRoom(room.roomNumber, player(id)));
    ['b', 'c', 'd'].forEach(id => rooms.setReady(room.roomNumber, id, true));
    const tile = (id, suit) => ({ id, suit, val: 1, copy: 1 });
    rooms.startGame(room.roomNumber, 'a');
    // 服务端发牌是随机的，测试需要确定牌型，所以用仅服务端可用的 seedGameState 覆盖。
    rooms.seedGameState(room.roomNumber, {
        phase: 'playing', currentPlayer: 'south',
        hands: { south: [tile('wan-1-1', 'wan'), tile('tong-1-1', 'tong')], east: [tile('tiao-1-1', 'tiao')], north: [], west: [] },
        discards: { south: [], east: [], north: [], west: [] },
        dingQue: { south: 'tong', east: '', north: '', west: [] },
        lastDiscard: null
    });
    return { rooms, room };
}

function createReactionRoom(eastHand, lastDiscard) {
    const rooms = new RoomService();
    const room = rooms.createRoom(player('a'));
    ['b', 'c', 'd'].forEach(id => rooms.joinRoom(room.roomNumber, player(id)));
    ['b', 'c', 'd'].forEach(id => rooms.setReady(room.roomNumber, id, true));
    rooms.startGame(room.roomNumber, 'a');
    rooms.seedGameState(room.roomNumber, {
        phase: 'reaction', currentPlayer: 'south', wall: [{ id: 'wan-9-4', suit: 'wan', val: 9, copy: 4 }],
        hands: { south: [], east: eastHand, north: [], west: [] },
        discards: { south: [lastDiscard], east: [], north: [], west: [] },
        melds: { south: [], east: [], north: [], west: [] },
        dingQue: { south: '', east: '', north: '', west: '' },
        winners: [], gangSettlements: [], huRecords: [], lastDiscard: { player: 'south', tile: lastDiscard }
    });
    return { rooms, room };
}

test('room service creates a room and lets up to four players join', () => {
    const rooms = new RoomService();
    const room = rooms.createRoom(player('a'));
    ['b', 'c', 'd'].forEach(id => rooms.joinRoom(room.roomNumber, player(id)));
    assert.equal(rooms.getRoom(room.roomNumber).players.length, 4);
    assert.throws(() => rooms.joinRoom(room.roomNumber, player('e')), /房间已满/);
});

test('room service rejects an invalid room number and repeated player join', () => {
    const rooms = new RoomService();
    const room = rooms.createRoom(player('a'));

    assert.throws(() => rooms.joinRoom('999999', player('b')), /房间不存在/);
    assert.throws(() => rooms.joinRoom(room.roomNumber, player('a')), /已经在这个房间/);
});

test('only owner can start after four players are ready, and the server deals the tiles itself', () => {
    const rooms = new RoomService();
    const room = rooms.createRoom(player('a'));
    ['b', 'c', 'd'].forEach(id => rooms.joinRoom(room.roomNumber, player(id)));
    assert.throws(() => rooms.startGame(room.roomNumber, 'a'), /所有玩家准备/);
    ['b', 'c', 'd'].forEach(id => rooms.setReady(room.roomNumber, id, true));
    assert.throws(() => rooms.startGame(room.roomNumber, 'b'), /只有房主/);

    // 关键安全断言：房主传什么都不算，牌由服务端自己洗自己发。
    const started = rooms.startGame(room.roomNumber, 'a', { phase: 'playing', wall: [], hands: { south: ['作弊牌'] } });
    assert.equal(started.status, 'playing');
    assert.equal(started.gameState.phase, 'playing');
    // 一副四川麻将 108 张，发完 14+13*3=53 张，牌墙应剩 55 张。
    assert.equal(started.gameState.wall.length, 55);
    assert.equal(started.gameState.hands.south.length, 14);
    ['east', 'north', 'west'].forEach(seat => assert.equal(started.gameState.hands[seat].length, 13));
    assert.notDeepEqual(started.gameState.hands.south, ['作弊牌'], '客户端指定的手牌必须被忽略');
});

test('two games in a row get different tile walls', () => {
    // 如果发牌可预测，作弊者就能提前算出会摸到什么。
    const deal = () => {
        const rooms = new RoomService();
        const room = rooms.createRoom(player('a'));
        ['b', 'c', 'd'].forEach(id => rooms.joinRoom(room.roomNumber, player(id)));
        ['b', 'c', 'd'].forEach(id => rooms.setReady(room.roomNumber, id, true));
        return rooms.startGame(room.roomNumber, 'a').gameState.hands.south.map(tile => tile.id).join(',');
    };
    assert.notEqual(deal(), deal(), '两局的发牌结果不应相同');
});

test('a player can cancel room ready status before the host starts', () => {
    const rooms = new RoomService();
    const room = rooms.createRoom(player('a'));
    rooms.joinRoom(room.roomNumber, player('b'));
    rooms.setReady(room.roomNumber, 'b', true);
    assert.equal(rooms.setReady(room.roomNumber, 'b', false).players[1].ready, false);
});

test('the server keeps an isolated snapshot that callers cannot mutate from outside', () => {
    const rooms = new RoomService();
    const room = rooms.createRoom(player('a'));
    ['b', 'c', 'd'].forEach(id => rooms.joinRoom(room.roomNumber, player(id)));
    ['b', 'c', 'd'].forEach(id => rooms.setReady(room.roomNumber, id, true));
    rooms.startGame(room.roomNumber, 'a');

    const nextState = { currentPlayer: 'east', wall: ['tong-9-1'], scores: { a: 3 } };
    rooms.seedGameState(room.roomNumber, nextState);
    // 播种后在外部改原对象，服务端快照不应跟着变（说明存的是深拷贝）。
    nextState.wall.push('tiao-2-1');
    const saved = rooms.getGameState(room.roomNumber);
    saved.scores.a = 99;

    assert.deepEqual(rooms.getGameState(room.roomNumber), { currentPlayer: 'east', wall: ['tong-9-1'], scores: { a: 3 } });
});

test('clients can no longer overwrite the game state at all', () => {
    const rooms = new RoomService();
    const room = rooms.createRoom(player('a'));
    ['b', 'c', 'd'].forEach(id => rooms.joinRoom(room.roomNumber, player(id)));
    ['b', 'c', 'd'].forEach(id => rooms.setReady(room.roomNumber, id, true));
    rooms.startGame(room.roomNumber, 'a');
    // 这是最直接的作弊入口，现在无论是谁、什么时候调用都一律拒绝。
    assert.throws(() => rooms.updateGameState(room.roomNumber, 'a', {}), /客户端不能直接覆写/);
    assert.throws(() => rooms.updateGameState(room.roomNumber, 'outsider', {}), /客户端不能直接覆写/);
});

test('a player only sees their own hand in the filtered room view', () => {
    const { rooms, room } = createPlayingRoom();
    const view = rooms.getRoomViewFor(room.roomNumber, 'a');
    // 'a' 是 south，只能看到自己的牌面；其他座位只给张数。
    assert.ok(view.gameState.hands.south, '自己的手牌要能看到');
    assert.equal(view.gameState.hands.east, undefined, '别人的手牌一张都不能下发');
    assert.equal(view.gameState.wall, undefined, '牌墙内容必须保密');
    assert.equal(typeof view.gameState.handCounts.east, 'number', '但要告诉界面别人有几张牌');
});

test('server accepts a legal discard and saves the resulting game state', () => {
    const { rooms, room } = createPlayingRoom();
    const result = rooms.discardTile(room.roomNumber, 'a', 'tong-1-1');

    assert.equal(result.discarded.id, 'tong-1-1');
    assert.equal(result.room.gameState.phase, 'reaction');
    assert.deepEqual(result.room.gameState.hands.south.map(tile => tile.id), ['wan-1-1']);
    assert.equal(result.room.gameState.lastDiscard.player, 'south');
});

test('server rejects out-of-turn, missing-tile, and ding-que-violating discards', () => {
    const { rooms, room } = createPlayingRoom();
    assert.throws(() => rooms.discardTile(room.roomNumber, 'b', 'tiao-1-1'), /还没有轮到/);
    assert.throws(() => rooms.discardTile(room.roomNumber, 'a', 'wan-9-1'), /手牌中没有/);
    assert.throws(() => rooms.discardTile(room.roomNumber, 'a', 'wan-1-1'), /定缺花色/);
});

test('server accepts a legal peng and a legal ming-gang from the latest discard', () => {
    const tile = { id: 'wan-5-4', suit: 'wan', val: 5, copy: 4 };
    const pengRoom = createReactionRoom([
        { id: 'wan-5-1', suit: 'wan', val: 5, copy: 1 }, { id: 'wan-5-2', suit: 'wan', val: 5, copy: 2 }
    ], tile);
    const peng = pengRoom.rooms.resolveAction(pengRoom.room.roomNumber, 'b', 'peng');
    assert.equal(peng.result.type, 'peng');
    assert.equal(peng.room.gameState.currentPlayer, 'east');

    const gangRoom = createReactionRoom([
        { id: 'wan-5-1', suit: 'wan', val: 5, copy: 1 }, { id: 'wan-5-2', suit: 'wan', val: 5, copy: 2 }, { id: 'wan-5-3', suit: 'wan', val: 5, copy: 3 }
    ], tile);
    const gang = gangRoom.rooms.resolveAction(gangRoom.room.roomNumber, 'b', 'gang');
    assert.equal(gang.result.type, 'ming_gang');
    assert.equal(gang.room.gameState.melds.east[0].tiles.length, 4);
});

test('server accepts a legal hu and rejects unavailable reactions', () => {
    const lastDiscard = { id: 'tong-9-4', suit: 'tong', val: 9, copy: 4 };
    const pairs = [1, 2, 3, 4, 5, 6].flatMap(value => [
        { id: `wan-${value}-1`, suit: 'wan', val: value, copy: 1 },
        { id: `wan-${value}-2`, suit: 'wan', val: value, copy: 2 }
    ]);
    const huRoom = createReactionRoom([...pairs, { id: 'tong-9-1', suit: 'tong', val: 9, copy: 1 }], lastDiscard);
    const hu = huRoom.rooms.resolveAction(huRoom.room.roomNumber, 'b', 'hu');
    assert.equal(hu.result.player, 'east');
    assert.deepEqual(hu.room.gameState.winners, ['east']);

    const noPengRoom = createReactionRoom([{ id: 'wan-1-1', suit: 'wan', val: 1, copy: 1 }], lastDiscard);
    assert.throws(() => noPengRoom.rooms.resolveAction(noPengRoom.room.roomNumber, 'b', 'peng'), /当前不能碰牌/);
    assert.throws(() => noPengRoom.rooms.resolveAction(noPengRoom.room.roomNumber, 'a', 'hu'), /当前没有可响应/);
});

test('server restores the current room and game snapshot for a returning player', () => {
    const { rooms, room } = createPlayingRoom();
    const restored = rooms.reconnectRoom(room.roomNumber, 'a');
    restored.gameState.hands.south.pop();

    assert.equal(restored.roomNumber, room.roomNumber);
    assert.equal(rooms.getGameState(room.roomNumber).hands.south.length, 2);
    assert.throws(() => rooms.reconnectRoom(room.roomNumber, 'outsider'), /不属于这个房间/);
});

test('room chat only accepts short non-empty text from a room player', () => {
    const rooms = new RoomService();
    const room = rooms.createRoom(player('a'));
    assert.deepEqual(rooms.createChatMessage(room.roomNumber, 'a', '  我准备好了  ').content, '我准备好了');
    assert.throws(() => rooms.createChatMessage(room.roomNumber, 'a', ''), /不能为空/);
    assert.throws(() => rooms.createChatMessage(room.roomNumber, 'outsider', '你好'), /不在这个房间/);
});

test('leaving transfers the owner and removes the room after the last player leaves', () => {
    const rooms = new RoomService();
    const room = rooms.createRoom(player('a'));
    rooms.joinRoom(room.roomNumber, player('b'));

    const afterOwnerLeaves = rooms.leaveRoom(room.roomNumber, 'a');
    assert.equal(afterOwnerLeaves.ownerId, 'b');
    assert.equal(afterOwnerLeaves.players.length, 1);
    assert.equal(rooms.leaveRoom(room.roomNumber, 'b'), null);
    assert.equal(rooms.getRoom(room.roomNumber), null);
});
