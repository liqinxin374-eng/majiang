/**
 * 登录态存取。
 *
 * 只存服务端返回的公开字段 {id, username, isGuest, coins}，
 * 绝不存密码，也不存密码哈希——服务端本来就不会把它们发下来。
 *
 * 存 localStorage 而不是 Cookie，是因为服务端目前没有 session 中间件，
 * 而且 Capacitor 在 iOS 上对跨来源 Cookie 限制很多，localStorage 三端行为一致。
 *
 * 令牌单独存一个键（mahjong.token），不与用户信息混在一起，
 * 这样 SESSION_STORAGE_KEY 里始终只有那四个公开字段，便于审计"有没有存不该存的东西"。
 */

export const SESSION_STORAGE_KEY = 'mahjong.session';
export const TOKEN_STORAGE_KEY = 'mahjong.token';

const resolveStorage = (storage) => storage ?? globalThis.localStorage;

/** 只保留认识的字段，防止把服务端将来新增的敏感字段一并缓存下来。 */
function sanitize(user) {
    if (!user || typeof user !== 'object') return null;
    if (typeof user.id !== 'string' || !user.id) return null;
    if (typeof user.username !== 'string' || !user.username) return null;
    return {
        id: user.id,
        username: user.username,
        isGuest: Boolean(user.isGuest),
        coins: Number.isFinite(user.coins) ? user.coins : 0
    };
}

/** 读取已保存的登录态；没有、损坏或格式不对时一律返回 null。 */
export function loadSession(storage) {
    try {
        const raw = resolveStorage(storage)?.getItem(SESSION_STORAGE_KEY);
        if (!raw) return null;
        // 存档可能被用户手改坏或被旧版本写脏，解析失败不能让整个应用起不来。
        return sanitize(JSON.parse(raw));
    } catch {
        return null;
    }
}

/** 保存登录态，返回真正写进去的对象。 */
export function saveSession(user, storage) {
    const safe = sanitize(user);
    if (!safe) throw new Error('登录信息不完整，无法保存。');
    try {
        resolveStorage(storage)?.setItem(SESSION_STORAGE_KEY, JSON.stringify(safe));
    } catch {
        // 存不下（隐私模式/配额满）不该阻断登录，本次会话仍然可用。
    }
    return safe;
}

/** 退出登录。 */
export function clearSession(storage) {
    try {
        resolveStorage(storage)?.removeItem(SESSION_STORAGE_KEY);
        resolveStorage(storage)?.removeItem(TOKEN_STORAGE_KEY);
    } catch {
        // 忽略：清不掉也不影响本次退出。
    }
}

/** 保存服务端签发的令牌，供下次启动恢复登录态。 */
export function saveToken(token, storage) {
    if (typeof token !== 'string' || !token) return null;
    try {
        resolveStorage(storage)?.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
        // 存不下不阻断本次会话，只是下次要重新登录。
    }
    return token;
}

/** 读取上次保存的令牌，没有则返回 null。 */
export function loadToken(storage) {
    try {
        return resolveStorage(storage)?.getItem(TOKEN_STORAGE_KEY) || null;
    } catch {
        return null;
    }
}

/** 金币变动后同步缓存，让界面下次打开就是最新数字。 */
export function updateSessionCoins(coins, storage) {
    const current = loadSession(storage);
    if (!current || !Number.isFinite(coins)) return current;
    return saveSession({ ...current, coins }, storage);
}
