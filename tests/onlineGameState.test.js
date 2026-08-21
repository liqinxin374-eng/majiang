import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server/createServer.js';
import { normalizeServerGameState, resolveViewerSeat } from '../src/onlineGameState.js';

/**
 * 前端联机接线测试。
 *
 * 服务端的防篡改改造（服务端发牌 + 按视角过滤）改变了下发数据的形状：
 * 别人的手牌没了、牌墙没了、座位不再一定是 south。
 * 界面如果还按老形状读，表现是「白屏」或者「点自己的牌没反应」——
 * 这类问题在真机上才暴露，所以必须在这里用真实服务端的真实数据挡住。
 */

async function withRunningServer(run) {
    const directory = mkdtempSync(join(tmpdir(), 'mahjong-online-'));
    const app = createAppServer({ databaseFile: join(directory, 'mahjong.db') });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    try {
        await run(app);
    } finally {
        await new Promise(resolve => app.server.close(resolve));
        app.accounts.close();
        rmSync(directory, { recursive: true, force: true });
    }
}

/** 建一个四人满员并已由服务端发牌的房间，返回四个人的 id。 */
function seatFourPlayersAndDeal({ accounts, rooms }) {
    const users = ['甲', '乙', '丙', '丁'].map(name => accounts.register({ username: `${name}家玩家`, password: 'pass-1234' }));
    const room = rooms.createRoom({ id: users[0].id, name: '甲' });
    users.slice(1).forEach((user, index) => rooms.joinRoom(room.roomNumber, { id: user.id, name: ['乙', '丙', '丁'][index] }));
    users.forEach(user => rooms.setReady(room.roomNumber, user.id, true));
    rooms.startGame(room.roomNumber, users[0].id);
    return { roomNumber: room.roomNumber, users };
}

test('a player who is not in the south seat still gets their own hand', async () => {
    await withRunningServer(async (app) => {
        const { roomNumber, users } = seatFourPlayersAndDeal(app);

        // 第二个进房的人不是南家。以前界面把座位写死成 south，
        // 他拿到的就是一串 null 占位牌，等于「有牌但点不动」。
        const secondPlayer = users[1];
        const view = app.rooms.getRoomViewFor(roomNumber, secondPlayer.id);
        const seat = resolveViewerSeat(view, secondPlayer.id);
        assert.notEqual(seat, 'south', '第二个加入的人不该被分到南家，否则这条测试就白测了');

        const normalized = normalizeServerGameState(view, secondPlayer.id);
        assert.equal(normalized.seat, seat);
        assert.ok(normalized.hand.length >= 13, '自己的手牌必须是真牌，不能是占位');
        assert.ok(normalized.hand.every(tile => tile && tile.id), `手牌必须带 id 才能点击出牌，实际拿到 ${JSON.stringify(normalized.hand[0])}`);
    });
});

test('other players are rendered by count only, never by real tiles', async () => {
    await withRunningServer(async (app) => {
        const { roomNumber, users } = seatFourPlayersAndDeal(app);
        const me = users[0];
        const normalized = normalizeServerGameState(app.rooms.getRoomViewFor(roomNumber, me.id), me.id);

        const otherSeats = ['south', 'east', 'north', 'west'].filter(seat => seat !== normalized.seat);
        otherSeats.forEach(seat => {
            const hand = normalized.gameState.hands[seat];
            assert.ok(Array.isArray(hand), `${seat} 必须有数组，否则渲染时 undefined.length 会直接白屏`);
            assert.ok(hand.length >= 13, `${seat} 的张数要准确，界面靠它画背面牌`);
            assert.ok(hand.every(tile => tile === null), `${seat} 的牌面必须拿不到，实际拿到 ${JSON.stringify(hand[0])}`);
        });
    });
});

test('the wall is padded to the right length but its tiles stay hidden', async () => {
    await withRunningServer(async (app) => {
        const { roomNumber, users } = seatFourPlayersAndDeal(app);
        const normalized = normalizeServerGameState(app.rooms.getRoomViewFor(roomNumber, users[0].id), users[0].id);

        // 108 张减去 4 家 53 张（庄 14 + 三家各 13）= 55 张牌墙。
        assert.equal(normalized.gameState.wall.length, 55, '剩余张数要对，界面要显示「剩 N 张」');
        assert.ok(normalized.gameState.wall.every(tile => tile === null), '牌墙内容必须保密，否则能算出下一张摸什么');
    });
});

test('a spectator who never joined the room gets nothing to render', async () => {
    await withRunningServer(async (app) => {
        const { roomNumber } = seatFourPlayersAndDeal(app);
        const outsider = app.accounts.register({ username: '路人甲乙', password: 'pass-1234' });
        const view = app.rooms.getRoomViewFor(roomNumber, outsider.id);

        assert.equal(resolveViewerSeat(view, outsider.id), null);
        assert.equal(normalizeServerGameState(view, outsider.id), null, '不在房里就不该渲染牌局，避免误以为自己在打牌');
    });
});

test('a room that has not started yet is simply skipped', () => {
    assert.equal(normalizeServerGameState({ players: [{ id: 'a', seat: 'south' }] }, 'a'), null);
    assert.equal(normalizeServerGameState(null, 'a'), null);
});
