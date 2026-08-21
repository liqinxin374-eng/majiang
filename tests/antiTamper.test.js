import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server/createServer.js';
import { createAccountClient } from '../src/accountClient.js';

/**
 * 防篡改测试：站在「改装过的手机客户端」角度真的去攻击一遍。
 *
 * 这一层测的不是"函数是否返回正确"，而是"坏人能不能得手"。
 * 每个用例都对应一条真实的作弊路径，断言的是**攻击失败**。
 */

async function withServer(run) {
    const directory = mkdtempSync(join(tmpdir(), 'mahjong-sec-'));
    const { server, accounts, rooms } = createAppServer({ databaseFile: join(directory, 'mahjong.db') });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        await run({ baseUrl, accounts, rooms });
    } finally {
        await new Promise(resolve => server.close(resolve));
        accounts.close();
        rmSync(directory, { recursive: true, force: true });
    }
}

/** 裸 fetch，用来模拟不走我们客户端、自己手搓请求的改装客户端。 */
const rawPost = (baseUrl, path, body, token) => fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
});

test('登录后才发令牌，注册和登录都会返回它', async () => {
    await withServer(async ({ baseUrl }) => {
        const response = await rawPost(baseUrl, '/api/auth/register', { username: '令牌测试', password: 'secure-pass-1' });
        const payload = await response.json();
        assert.equal(response.status, 201);
        assert.ok(payload.token, '注册成功必须签发令牌');
        assert.equal('passwordHash' in payload.user, false, '不能把密码哈希发给客户端');
    });
});

test('没有令牌就调用受保护接口，一律 401', async () => {
    await withServer(async ({ baseUrl }) => {
        for (const path of ['/api/matches', '/api/rooms', '/api/rooms/join', '/api/rooms/start']) {
            const response = await rawPost(baseUrl, path, { roomNumber: '100000' });
            assert.equal(response.status, 401, `${path} 必须要求登录`);
            assert.match((await response.json()).error, /请先登录/);
        }
    });
});

test('伪造的令牌不被接受', async () => {
    await withServer(async ({ baseUrl }) => {
        const response = await rawPost(baseUrl, '/api/rooms', { player: { name: '伪造者' } }, 'a'.repeat(64));
        assert.equal(response.status, 401);
        assert.match((await response.json()).error, /登录已失效/);
    });
});

test('退出登录后旧令牌立刻失效', async () => {
    await withServer(async ({ baseUrl }) => {
        const client = createAccountClient({ baseUrl });
        await client.register('登出测试', 'secure-pass-1');
        const token = client.getToken();
        await client.logout();
        const response = await rawPost(baseUrl, '/api/rooms', { player: { name: '登出测试' } }, token);
        assert.equal(response.status, 401, '令牌已作废，不能继续用');
    });
});

test('冒充他人：请求体里写别人的 playerId 也只会操作到自己', async () => {
    await withServer(async ({ baseUrl }) => {
        const attacker = createAccountClient({ baseUrl });
        const victim = createAccountClient({ baseUrl });
        const attackerUser = await attacker.register('攻击者', 'secure-pass-1');
        const victimUser = await victim.register('受害者', 'secure-pass-1');

        // 攻击者建房，然后在请求体里把 player.id 写成受害者的 id。
        const created = await rawPost(baseUrl, '/api/rooms', {
            player: { id: victimUser.id, name: '受害者' }
        }, attacker.getToken()).then(response => response.json());

        // 服务端只认令牌，房主必须是攻击者自己，不是被冒充的受害者。
        assert.equal(created.room.ownerId, attackerUser.id, '身份必须来自令牌，不能来自请求体');
        assert.notEqual(created.room.ownerId, victimUser.id);
    });
});

test('伪造战绩：不能凭空上报四人分数刷排行榜', async () => {
    await withServer(async ({ baseUrl }) => {
        const client = createAccountClient({ baseUrl });
        const cheater = await client.register('刷分者', 'secure-pass-1');

        // 老攻击手法：直接 POST 一份自己大赢的战绩。
        const response = await rawPost(baseUrl, '/api/matches', {
            roomNumber: '999999',
            playerResults: [
                { userId: cheater.id, seat: 'south', scoreDelta: 99999, isWinner: true },
                { userId: cheater.id, seat: 'east', scoreDelta: -1, isWinner: false },
                { userId: cheater.id, seat: 'north', scoreDelta: -1, isWinner: false },
                { userId: cheater.id, seat: 'west', scoreDelta: -1, isWinner: false }
            ]
        }, client.getToken());

        assert.equal(response.status, 400, '不存在的房间不能结算');
        // 分数没被记上，排行榜依然是初始金币。
        const leaderboard = await client.fetchLeaderboard();
        assert.equal(leaderboard[0].coins, 1000, '伪造的分数不能影响金币');
        assert.equal(leaderboard[0].stats.games, 0, '伪造的战绩不能计入场次');
    });
});

test('操纵发牌：房主指定手牌无效，牌由服务端洗', async () => {
    await withServer(async ({ baseUrl }) => {
        const host = createAccountClient({ baseUrl });
        await host.register('房主', 'secure-pass-1');
        const created = await host.createRoom('房主');

        for (const name of ['玩家二', '玩家三', '玩家四']) {
            const mate = createAccountClient({ baseUrl });
            await mate.register(name, 'secure-pass-1');
            await mate.joinRoom(created.roomNumber, name);
            await mate.setReady(created.roomNumber, true);
        }
        await host.setReady(created.roomNumber, true);

        // 房主试图连同一副"天听牌"一起提交。
        const started = await rawPost(baseUrl, '/api/rooms/start', {
            roomNumber: created.roomNumber,
            gameState: { phase: 'playing', hands: { south: ['我要的牌'] }, wall: [] }
        }, host.getToken()).then(response => response.json());

        // 服务端自己发的牌：自己 14 张，牌墙 55 张，绝不是客户端塞的那份。
        assert.equal(started.room.gameState.hands.south.length, 14);
        assert.equal(started.room.gameState.wallCount, 55);
        assert.notDeepEqual(started.room.gameState.hands.south, ['我要的牌']);
    });
});

test('偷看底牌：广播里不含别人的手牌和牌墙', async () => {
    await withServer(async ({ baseUrl }) => {
        const host = createAccountClient({ baseUrl });
        await host.register('偷看房主', 'secure-pass-1');
        const created = await host.createRoom('偷看房主');
        for (const name of ['旁观二', '旁观三', '旁观四']) {
            const mate = createAccountClient({ baseUrl });
            await mate.register(name, 'secure-pass-1');
            await mate.joinRoom(created.roomNumber, name);
            await mate.setReady(created.roomNumber, true);
        }
        await host.setReady(created.roomNumber, true);
        const started = await host.startGame(created.roomNumber);

        const hands = started.gameState.hands;
        assert.ok(hands.south, '自己的牌要能看到');
        ['east', 'north', 'west'].forEach(seat => {
            assert.equal(hands[seat], undefined, `${seat} 的手牌绝不能下发给别人`);
        });
        assert.equal(started.gameState.wall, undefined, '牌墙内容必须保密');
        assert.equal(started.gameState.wallCount, 55, '只告诉还剩几张');
    });
});

test('金币只能由服务端结算改动，令牌不能直接改余额', async () => {
    await withServer(async ({ baseUrl, accounts }) => {
        const client = createAccountClient({ baseUrl });
        const user = await client.register('余额测试', 'secure-pass-1');
        // 没有任何对外接口可以直接设置金币，只能通过结算流水。
        const before = (await client.fetchCoins(user.id)).coins;
        await rawPost(baseUrl, '/api/users/' + user.id + '/coins', { coins: 999999 }, client.getToken());
        assert.equal((await client.fetchCoins(user.id)).coins, before, '不存在改余额的接口');
        // 服务端内部记账仍然要留下流水，余额和流水必须对得上。
        assert.equal(accounts.getTransactions(user.id).at(-1).balanceAfter, before);
    });
});

test('令牌只存哈希：数据库里看不到原始令牌', async () => {
    await withServer(async ({ baseUrl, accounts }) => {
        const client = createAccountClient({ baseUrl });
        await client.register('哈希测试', 'secure-pass-1');
        const token = client.getToken();
        const row = accounts.database.prepare('SELECT token_hash FROM sessions').get();
        assert.ok(row.token_hash, '必须存下令牌哈希');
        assert.notEqual(row.token_hash, token, '绝不能明文存令牌');
    });
});
