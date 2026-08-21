import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_STORAGE_KEY, TOKEN_STORAGE_KEY, clearSession, loadSession, loadToken, saveSession, saveToken, updateSessionCoins } from '../src/sessionStore.js';

const createStorage = (initial = {}) => {
    const data = new Map(Object.entries(initial));
    return {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key)
    };
};

test('a logged in player is still logged in after reopening the app', () => {
    const storage = createStorage();
    saveSession({ id: 'u1', username: '老王', isGuest: false, coins: 1200 }, storage);
    // 相当于关掉 App 再打开：从存储里重新读一遍。
    assert.deepEqual(loadSession(storage), { id: 'u1', username: '老王', isGuest: false, coins: 1200 });
});

test('only the four public fields are cached, never a password', () => {
    const storage = createStorage();
    saveSession({ id: 'u1', username: '老王', isGuest: false, coins: 1200, passwordHash: 'must-not-be-stored', password: '123456' }, storage);
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    assert.doesNotMatch(raw, /password/i, '本地缓存里绝不能出现任何密码相关字段');
    assert.deepEqual(Object.keys(loadSession(storage)).sort(), ['coins', 'id', 'isGuest', 'username']);
});

test('no session yet simply means not logged in', () => {
    assert.equal(loadSession(createStorage()), null);
});

test('a corrupted session does not break start-up', () => {
    assert.equal(loadSession(createStorage({ [SESSION_STORAGE_KEY]: '{坏掉的 JSON' })), null);
    assert.equal(loadSession(createStorage({ [SESSION_STORAGE_KEY]: '{"username":"缺少id"}' })), null);
    assert.equal(loadSession(createStorage({ [SESSION_STORAGE_KEY]: 'null' })), null);
});

test('logging out really removes the stored session', () => {
    const storage = createStorage();
    saveSession({ id: 'u1', username: '老王', coins: 1000 }, storage);
    clearSession(storage);
    assert.equal(loadSession(storage), null);
});

test('coin changes are written back so the next launch shows the right number', () => {
    const storage = createStorage();
    saveSession({ id: 'u1', username: '老王', isGuest: false, coins: 1000 }, storage);
    updateSessionCoins(1380, storage);
    assert.equal(loadSession(storage).coins, 1380);
    assert.equal(loadSession(storage).username, '老王', '更新金币不应该弄丢其他字段');
});

test('incomplete user objects are refused instead of silently stored', () => {
    const storage = createStorage();
    assert.throws(() => saveSession({ username: '没有编号' }, storage), /登录信息不完整/);
    assert.throws(() => saveSession(null, storage), /登录信息不完整/);
});

test('a storage that refuses to write does not break login', () => {
    const brokenStorage = {
        getItem: () => null,
        setItem: () => { throw new Error('隐私模式禁止写入'); },
        removeItem: () => { throw new Error('隐私模式禁止写入'); }
    };
    // 存不下也要能继续玩，只是下次打开需要重新登录。
    assert.deepEqual(saveSession({ id: 'u1', username: '老王', coins: 1000 }, brokenStorage), { id: 'u1', username: '老王', isGuest: false, coins: 1000 });
    assert.doesNotThrow(() => clearSession(brokenStorage));
});

/* ────────────────────────────────────────────────
 * 令牌持久化
 *
 * 令牌是服务端认人的唯一凭据。只存 user 不存 token 的后果很隐蔽：
 * 重开 App 后界面显示「已登录」，但每个请求都会被 401 顶回来，
 * 玩家看到的现象是「登录了却什么都点不动」。
 * ──────────────────────────────────────────────── */

test('the token survives a restart so the player stays logged in', () => {
    const storage = createStorage();
    saveToken('a'.repeat(64), storage);
    assert.equal(loadToken(storage), 'a'.repeat(64));
});

test('no token yet means the player must log in again', () => {
    assert.equal(loadToken(createStorage()), null);
});

test('the token is kept apart from the user info', () => {
    const storage = createStorage();
    saveSession({ id: 'u1', username: '老王', isGuest: false, coins: 1000 }, storage);
    saveToken('secret-token', storage);
    // 会话那份数据在很多地方被读、被打日志，令牌混进去容易被顺手打出来。
    assert.doesNotMatch(storage.getItem(SESSION_STORAGE_KEY), /secret-token/);
    assert.equal(storage.getItem(TOKEN_STORAGE_KEY), 'secret-token');
});

test('logging out clears the token as well, not just the user info', () => {
    const storage = createStorage();
    saveSession({ id: 'u1', username: '老王', coins: 1000 }, storage);
    saveToken('secret-token', storage);
    clearSession(storage);
    // 只清 user 不清 token 的话，令牌还留在手机上，被抄走就能继续用这个账号。
    assert.equal(loadToken(storage), null, '退出登录必须把令牌一起清掉');
    assert.equal(loadSession(storage), null);
});

test('an empty or non-string token is refused instead of stored as garbage', () => {
    const storage = createStorage();
    assert.equal(saveToken('', storage), null);
    assert.equal(saveToken(undefined, storage), null);
    assert.equal(saveToken(123, storage), null);
    // 存进去一个 "undefined" 字符串，之后会被当成有效令牌发出去，白挨一个 401。
    assert.equal(loadToken(storage), null);
});
