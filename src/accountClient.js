/**
 * 账号接口客户端。
 *
 * 这一层只负责“发请求、解结果、抛人话错误”，完全不碰 DOM，
 * 所以可以在 Node 里注入一个假的 fetch 直接单测——
 * 之前 BUG-002 之所以没被测出来，正是因为前后端之间根本没有这一层。
 *
 * 服务端契约（已逐行核对 server/index.js）：
 *   POST /api/auth/register  {username,password} -> 201 {user}
 *   POST /api/auth/login     {username,password} -> 200 {user}
 *   POST /api/auth/guest     {}                  -> 201 {user}
 *   GET  /api/users/:id                          -> 200 {user}
 *   GET  /api/users/:id/coins                    -> 200 {userId,coins}
 *   GET  /api/users/:id/matches                  -> 200 {matches:[...]}
 *   POST /api/matches        {roomNumber,playerResults[4]} -> 201 {match}
 *   GET  /api/leaderboard                        -> 200 {leaderboard:[...]}
 * 出错一律是 {error:'中文原因'}，所以界面要显示 error 字段，而不是冷冰冰的状态码。
 */

export const DEFAULT_TIMEOUT_MS = 8000;

/**
 * 服务端用 request.url.split('/') 解析用户接口，带 ? 查询串会把路径切坏
 * （'/api/users/x/matches?limit=5' 会被切成 'matches?limit=5'）。
 * 所以这里一律不拼查询串，条数用服务端默认值。
 */
function assertPathSafeUserId(userId) {
    if (typeof userId !== 'string' || !userId || /[/?#]/.test(userId)) {
        throw new Error('用户编号不合法。');
    }
    return userId;
}

export function createAccountClient({ baseUrl, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (typeof baseUrl !== 'string' || !baseUrl) throw new Error('需要提供服务器地址。');
    const request = fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (typeof request !== 'function') throw new Error('当前环境不支持 fetch。');
    const root = baseUrl.replace(/\/+$/, '');
    // 登录后由服务端签发，之后每个请求都带上，服务端靠它确认"你是谁"。
    let authToken = null;

    async function call(path, { method = 'GET', body } = {}) {
        // 没有超时的话，服务器地址填错时界面会一直转圈，用户不知道发生了什么。
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (authToken) headers.Authorization = `Bearer ${authToken}`;

        let response;
        try {
            response = await request(`${root}${path}`, {
                method,
                headers: Object.keys(headers).length ? headers : undefined,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller?.signal
            });
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error('连接服务器超时，请检查网络或服务器地址。');
            throw new Error('无法连接服务器，请确认服务端已启动且地址填写正确。');
        } finally {
            if (timer) clearTimeout(timer);
        }

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!response.ok) {
            // 服务端的中文提示（如“该昵称已被使用。”）比状态码有用得多，优先透传。
            throw new Error(payload?.error || `服务器返回了错误（${response.status}）。`);
        }
        if (payload === null) throw new Error('服务器返回的内容无法识别。');
        return payload;
    }

    return {
        baseUrl: root,

        /** 读取当前令牌，供上层存进本地会话，下次启动直接恢复登录态。 */
        getToken() { return authToken; },

        /** 恢复上次登录的令牌（App 重启后调用）。 */
        setToken(token) { authToken = typeof token === 'string' && token ? token : null; },

        async register(username, password) {
            const { user, token } = await call('/api/auth/register', { method: 'POST', body: { username, password } });
            if (token) authToken = token;
            return user;
        },

        async login(username, password) {
            const { user, token } = await call('/api/auth/login', { method: 'POST', body: { username, password } });
            if (token) authToken = token;
            return user;
        },

        async loginAsGuest() {
            const { user, token } = await call('/api/auth/guest', { method: 'POST', body: {} });
            if (token) authToken = token;
            return user;
        },

        /** 退出登录：让服务端作废这枚令牌，本地也清掉。 */
        async logout() {
            try {
                if (authToken) await call('/api/auth/logout', { method: 'POST', body: {} });
            } finally {
                authToken = null;
            }
        },

        async fetchProfile(userId) {
            const { user } = await call(`/api/users/${assertPathSafeUserId(userId)}`);
            return user;
        },

        async fetchCoins(userId) {
            return call(`/api/users/${assertPathSafeUserId(userId)}/coins`);
        },

        async fetchMatches(userId) {
            const { matches } = await call(`/api/users/${assertPathSafeUserId(userId)}/matches`);
            return matches ?? [];
        },

        async fetchLeaderboard() {
            const { leaderboard } = await call('/api/leaderboard');
            return leaderboard ?? [];
        },

        /**
         * 请求服务端结算本局。
         *
         * 注意：**不再上传分数**。分数由服务端按它自己保存的牌局快照计算，
         * 客户端只能说"这局打完了，请结算"，报不了假分。
         */
        async saveMatch(roomNumber) {
            const { match } = await call('/api/matches', { method: 'POST', body: { roomNumber } });
            return match;
        },

        // ---- 房间操作 ----
        // 都不再传 playerId：服务端从令牌里取真实身份，因此冒充不了别人。

        async createRoom(name) {
            const { room } = await call('/api/rooms', { method: 'POST', body: { player: { name } } });
            return room;
        },

        async joinRoom(roomNumber, name) {
            const { room } = await call('/api/rooms/join', { method: 'POST', body: { roomNumber, player: { name } } });
            return room;
        },

        async setReady(roomNumber, ready) {
            const { room } = await call('/api/rooms/ready', { method: 'POST', body: { roomNumber, ready } });
            return room;
        },

        /** 开始游戏。牌由服务端发，这里没有 gameState 参数可传。 */
        async startGame(roomNumber) {
            const { room } = await call('/api/rooms/start', { method: 'POST', body: { roomNumber } });
            return room;
        },

        async leaveRoom(roomNumber) {
            const { room } = await call('/api/rooms/leave', { method: 'POST', body: { roomNumber } });
            return room;
        }
    };
}
