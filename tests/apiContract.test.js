import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server/createServer.js';
import { createAccountClient } from '../src/accountClient.js';

/**
 * 前端 ↔ 服务端 集成测试（BUG-002 的正面回归）。
 *
 * 这一层测的不是“函数返回了什么”，而是“前端真的能把数据取回来吗”：
 *   - 启动一台真实的 server（随机端口，独立的临时数据库）
 *   - 用前端真实的 accountClient
 *   - 用真实的 fetch 发真实的 HTTP 请求
 *
 * 只要前后端字段名、路径、状态码有任何一处对不上，这里就会红。
 * 之前 108 项测试全绿却整块功能不通，缺的就是这一层。
 */

/** 起一台服务器并把前端客户端接上去，用完自动清理。 */
async function withRunningServer(run) {
    const directory = mkdtempSync(join(tmpdir(), 'mahjong-api-'));
    const { server, accounts } = createAppServer({ databaseFile: join(directory, 'mahjong.db') });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const client = createAccountClient({ baseUrl: `http://127.0.0.1:${port}` });
    try {
        await run(client, { port });
    } finally {
        await new Promise(resolve => server.close(resolve));
        accounts.close();
        rmSync(directory, { recursive: true, force: true });
    }
}

test('a brand new player can register, log out and log back in over real HTTP', async () => {
    await withRunningServer(async (client) => {
        const created = await client.register('集成测试玩家', 'secure-pass-1');
        assert.equal(created.username, '集成测试玩家');
        assert.equal(created.coins, 1000);
        assert.equal(created.isGuest, false);
        assert.ok(created.id, '服务端必须返回用户编号，前端要靠它查金币和战绩');
        assert.equal('passwordHash' in created, false, '接口不能把密码哈希发给客户端');

        const loggedIn = await client.login('集成测试玩家', 'secure-pass-1');
        assert.equal(loggedIn.id, created.id);
    });
});

test('guest entry works without any input', async () => {
    await withRunningServer(async (client) => {
        const guest = await client.loginAsGuest();
        assert.equal(guest.isGuest, true);
        assert.match(guest.username, /^游客\d{6}$/);
        assert.equal(guest.coins, 1000);
    });
});

test('wrong credentials surface the server message the UI will display', async () => {
    await withRunningServer(async (client) => {
        await client.register('密码测试', 'secure-pass-1');
        await assert.rejects(() => client.login('密码测试', 'wrong-pass'), /昵称或密码错误/);
        await assert.rejects(() => client.register('密码测试', 'secure-pass-2'), /该昵称已被使用/);
        await assert.rejects(() => client.register('x', 'secure-pass-1'), /昵称需为/);
    });
});

test('coins, profile, match history and leaderboard are all reachable from the client', async () => {
    await withRunningServer(async (client) => {
        const players = [];
        for (const username of ['榜单南', '榜单东', '榜单北', '榜单西']) {
            players.push(await client.register(username, 'secure-pass-1'));
        }

        // 战绩不再由客户端上报分数：四人真的建房、准备、由服务端发牌开局，再请求结算。
        // client 当前持有最后一个注册者（榜单西）的令牌，先让他建房。
        const created = await client.createRoom('榜单西');
        for (const [index, username] of ['榜单南', '榜单东', '榜单北'].entries()) {
            const mate = createAccountClient({ baseUrl: client.baseUrl });
            await mate.login(username, 'secure-pass-1');
            await mate.joinRoom(created.roomNumber, username);
            await mate.setReady(created.roomNumber, true);
            assert.ok(index >= 0);
        }
        await client.setReady(created.roomNumber, true);
        await client.startGame(created.roomNumber);
        const match = await client.saveMatch(created.roomNumber);
        assert.equal(match.status, 'finished');
        assert.equal(match.players.length, 4);

        // 金币
        const coins = await client.fetchCoins(players[0].id);
        assert.deepEqual(coins, { userId: players[0].id, coins: 1000 });

        // 个人资料 + 战绩统计
        const profile = await client.fetchProfile(players[0].id);
        assert.equal(profile.stats.games, 1);

        // 战绩列表
        const matches = await client.fetchMatches(players[0].id);
        assert.equal(matches.length, 1);
        assert.equal(matches[0].roomNumber, created.roomNumber);

        // 排行榜
        const leaderboard = await client.fetchLeaderboard();
        assert.equal(leaderboard.length, 4);
        assert.equal(leaderboard[0].rank, 1);
        assert.ok(leaderboard.every(item => typeof item.username === 'string' && typeof item.coins === 'number'));
    });
});

test('every field the UI renders is actually present in the responses', async () => {
    // 界面上要显示昵称和金币；只要服务端少发一个字段，界面就会出现 undefined。
    await withRunningServer(async (client) => {
        const user = await client.register('字段核对', 'secure-pass-1');
        assert.deepEqual(Object.keys(user).sort(), ['coins', 'id', 'isGuest', 'username']);

        const profile = await client.fetchProfile(user.id);
        ['id', 'username', 'isGuest', 'coins', 'createdAt', 'stats'].forEach(field => {
            assert.ok(field in profile, `个人资料缺少 ${field} 字段，界面会显示 undefined`);
        });
        assert.deepEqual(Object.keys(profile.stats).sort(), ['games', 'wins']);

        const [entry] = await client.fetchLeaderboard();
        ['rank', 'id', 'username', 'isGuest', 'coins', 'stats'].forEach(field => {
            assert.ok(field in entry, `排行榜缺少 ${field} 字段`);
        });
    });
});

test('unknown users produce a readable error rather than a blank screen', async () => {
    await withRunningServer(async (client) => {
        await assert.rejects(() => client.fetchCoins('not-a-real-user'), /用户不存在/);
        await assert.rejects(() => client.fetchMatches('not-a-real-user'), /用户不存在/);
    });
});

test('account data written through the API is still there after the server restarts', async () => {
    // 把 BUG-002（接不通）和 BUG-003（不持久化）连起来测：
    // 通过真实 HTTP 注册的账号，重启服务器之后必须还能登录、金币不变。
    const directory = mkdtempSync(join(tmpdir(), 'mahjong-api-restart-'));
    const databaseFile = join(directory, 'mahjong.db');
    try {
        const first = createAppServer({ databaseFile });
        await new Promise(resolve => first.server.listen(0, '127.0.0.1', resolve));
        const firstPort = first.server.address().port;
        const firstClient = createAccountClient({ baseUrl: `http://127.0.0.1:${firstPort}` });
        const created = await firstClient.register('重启也在', 'secure-pass-1');
        await new Promise(resolve => first.server.close(resolve));
        first.accounts.close();

        const second = createAppServer({ databaseFile });
        await new Promise(resolve => second.server.listen(0, '127.0.0.1', resolve));
        const secondPort = second.server.address().port;
        const secondClient = createAccountClient({ baseUrl: `http://127.0.0.1:${secondPort}` });
        try {
            const loggedIn = await secondClient.login('重启也在', 'secure-pass-1');
            assert.equal(loggedIn.id, created.id, '重启后必须还是同一个账号');
            assert.equal(loggedIn.coins, 1000);
        } finally {
            await new Promise(resolve => second.server.close(resolve));
            second.accounts.close();
        }
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
