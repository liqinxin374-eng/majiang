import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient } from '../src/accountClient.js';

/**
 * BUG-002 的单元层回归测试：注入一个假的 fetch，检查请求发得对不对、错误解得准不准。
 * 真实联通性由 tests/apiContract.test.js 负责，两层各管一段。
 */

/** 造一个假 fetch，并把收到的请求记下来供断言。 */
const createFetchStub = (responder) => {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
        calls.push({ url, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined });
        return responder(url, options);
    };
    fetchImpl.calls = calls;
    return fetchImpl;
};

const jsonResponse = (status, payload) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
});

const clientWith = (responder) => {
    const fetchImpl = createFetchStub(responder);
    return { client: createAccountClient({ baseUrl: 'http://192.168.1.10:3001', fetchImpl }), fetchImpl };
};

test('register posts credentials to the real auth endpoint and returns the user', async () => {
    const { client, fetchImpl } = clientWith(() => jsonResponse(201, { user: { id: 'u1', username: '新手玩家', isGuest: false, coins: 1000 } }));
    const user = await client.register('新手玩家', 'secure-pass-1');
    assert.deepEqual(user, { id: 'u1', username: '新手玩家', isGuest: false, coins: 1000 });
    assert.equal(fetchImpl.calls[0].url, 'http://192.168.1.10:3001/api/auth/register');
    assert.equal(fetchImpl.calls[0].method, 'POST');
    assert.deepEqual(fetchImpl.calls[0].body, { username: '新手玩家', password: 'secure-pass-1' });
});

test('login and guest entries hit their own endpoints', async () => {
    const { client, fetchImpl } = clientWith(() => jsonResponse(200, { user: { id: 'u2', username: '游客123456', isGuest: true, coins: 1000 } }));
    await client.login('某人', 'secure-pass-1');
    await client.loginAsGuest();
    assert.deepEqual(fetchImpl.calls.map(call => call.url), [
        'http://192.168.1.10:3001/api/auth/login',
        'http://192.168.1.10:3001/api/auth/guest'
    ]);
});

test('server error message is shown to the player instead of a status code', async () => {
    const { client } = clientWith(() => jsonResponse(400, { error: '该昵称已被使用。' }));
    // 玩家要看到“该昵称已被使用。”，而不是“400”。
    await assert.rejects(() => client.register('重名', 'secure-pass-1'), /该昵称已被使用。/);
});

test('an error response without a message still produces something readable', async () => {
    const { client } = clientWith(() => jsonResponse(500, null));
    await assert.rejects(() => client.fetchLeaderboard(), /服务器返回了错误（500）/);
});

test('network failure is reported as an address or server problem', async () => {
    const { client } = clientWith(() => { throw new TypeError('fetch failed'); });
    await assert.rejects(() => client.fetchLeaderboard(), /无法连接服务器/);
});

test('a hanging server aborts instead of spinning forever', async () => {
    const fetchImpl = (url, options) => new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
        });
    });
    const client = createAccountClient({ baseUrl: 'http://192.168.1.10:3001', fetchImpl, timeoutMs: 30 });
    await assert.rejects(() => client.fetchLeaderboard(), /超时/);
});

test('coins, matches and leaderboard use the documented paths and unwrap their payloads', async () => {
    const { client, fetchImpl } = clientWith((url) => {
        if (url.endsWith('/coins')) return jsonResponse(200, { userId: 'u1', coins: 1250 });
        if (url.endsWith('/matches')) return jsonResponse(200, { matches: [{ id: 'm1', roomNumber: '100001' }] });
        if (url.endsWith('/leaderboard')) return jsonResponse(200, { leaderboard: [{ rank: 1, username: '榜一' }] });
        return jsonResponse(200, { user: { id: 'u1', username: '玩家', isGuest: false, coins: 1250 } });
    });

    assert.deepEqual(await client.fetchCoins('u1'), { userId: 'u1', coins: 1250 });
    assert.equal((await client.fetchMatches('u1'))[0].roomNumber, '100001');
    assert.equal((await client.fetchLeaderboard())[0].username, '榜一');
    assert.equal((await client.fetchProfile('u1')).coins, 1250);

    assert.deepEqual(fetchImpl.calls.map(call => call.url), [
        'http://192.168.1.10:3001/api/users/u1/coins',
        'http://192.168.1.10:3001/api/users/u1/matches',
        'http://192.168.1.10:3001/api/leaderboard',
        'http://192.168.1.10:3001/api/users/u1'
    ]);
});

test('user ids that could break the server path parser are rejected up front', async () => {
    const { client } = clientWith(() => jsonResponse(200, {}));
    // 服务端是用 split('/') 解析路径的，带斜杠或问号会把路径切坏。
    for (const badId of ['', 'a/b', 'a?limit=5', 'a#x']) {
        await assert.rejects(() => client.fetchCoins(badId), /用户编号不合法/);
    }
});

test('trailing slashes in the server address do not produce doubled slashes', async () => {
    const fetchImpl = createFetchStub(() => jsonResponse(200, { leaderboard: [] }));
    const client = createAccountClient({ baseUrl: 'http://192.168.1.10:3001///', fetchImpl });
    await client.fetchLeaderboard();
    assert.equal(fetchImpl.calls[0].url, 'http://192.168.1.10:3001/api/leaderboard');
});

test('creating a client without an address fails immediately', () => {
    assert.throws(() => createAccountClient({ baseUrl: '' }), /需要提供服务器地址/);
});
