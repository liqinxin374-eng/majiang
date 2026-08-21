import http from 'node:http';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { AccountService } from './accountService.js';
import { RoomService } from './roomService.js';
import { requireBoundRoomPlayer, requireAuthenticatedSocket } from './requestAuth.js';
import { attachWebSocketServer, encodeWebSocketText } from './webSocketServer.js';

/**
 * 组装一台完整的房间服务器，但**不负责监听端口**。
 *
 * 拆出这个工厂函数是为了让集成测试能在随机端口上启动一台“货真价实”的服务器，
 * 用真实 HTTP 请求跑一遍全部账号接口。
 * 之前 BUG-002 之所以能瞒过 108 项测试，就是因为从来没有人真的把请求发出去过。
 *
 * @param {{ databaseFile?: string }} [options]
 */
export function createAppServer(options = {}) {
    const rooms = new RoomService();
    const accounts = new AccountService({ databaseFile: options.databaseFile });
    const broadcastRoom = (roomNumber, message) => realtime.broadcast(message, client => client.roomNumber === roomNumber);

    /**
     * 逐人广播房间状态：每位玩家收到的都是「自己视角」的快照。
     *
     * 不能用统一的 broadcast，因为那样所有人拿到的是同一份含全部手牌的 JSON，
     * 手机端只要把收到的消息打出来就能看穿对手底牌。
     */
    const broadcastRoomPerViewer = (roomNumber, type = 'room:updated', extra = {}) => {
        realtime.forEachClient(client => {
            if (client.roomNumber !== roomNumber || !client.playerId) return;
            client.write(encodeWebSocketText({ type, ...extra, room: rooms.getRoomViewFor(roomNumber, client.playerId) }));
        });
    };

    /**
     * 跨域响应头。
     *
     * 为什么必须有：网页和后端从来不是同一个来源。
     *   - 本地开发：网页在 127.0.0.1:4173，后端在 127.0.0.1:3001，端口不同就算跨域。
     *   - 打包成 App：页面来源是 capacitor:// 或 file://，和后端更是八竿子打不着。
     * 少了这几个头，浏览器/WebView 会在 JS 拿到响应之前就把它拦掉。
     * 表现极具误导性：服务端日志显示 200 正常返回，前端却只报「无法连接服务器」,
     * 因为 fetch 抛的是 TypeError，看不出是被 CORS 挡的还是真的没连上。
     *
     * Authorization 必须写进 allow-headers：登录后每个请求都带 Bearer 令牌，
     * 它属于「非简单请求头」，不放通的话浏览器连预检都过不了。
     */
    function corsHeaders(request) {
        return {
            // 带令牌的请求不需要 cookie，所以这里用 * 就够，不必回显 Origin。
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': request?.headers?.['access-control-request-headers'] || 'Content-Type, Authorization',
            // 预检结果缓存一天，省掉每个请求前面那次多余的 OPTIONS 往返。
            'Access-Control-Max-Age': '86400'
        };
    }

    function sendJson(response, statusCode, body) {
        response.writeHead(statusCode, {
            'Content-Type': 'application/json; charset=utf-8',
            ...corsHeaders(response.req)
        });
        response.end(JSON.stringify(body));
    }

    /**
     * 从 Authorization: Bearer <token> 头里取出令牌并换成真实 userId。
     *
     * 这是「防手机端篡改」的关口：返回的 userId 来自服务端 sessions 表，
     * 而不是请求体里客户端自称的那个 userId。
     */
    function requireUserId(request) {
        const header = request.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
        return accounts.verifyToken(token);
    }

    async function readJson(request) {
        let rawBody = '';
        for await (const chunk of request) rawBody += chunk;
        return rawBody ? JSON.parse(rawBody) : {};
    }

    const server = http.createServer(async (request, response) => {
        try {
            // 预检请求：浏览器在发带 Authorization 头的 POST 之前会先来一次 OPTIONS，
            // 必须回 204 并带上放通头，否则真正的请求根本不会发出。
            if (request.method === 'OPTIONS') {
                response.writeHead(204, corsHeaders(request));
                return response.end();
            }
            if (request.method === 'GET' && request.url === '/api/leaderboard') return sendJson(response, 200, { leaderboard: accounts.getLeaderboard() });
            if (request.method === 'GET' && request.url?.startsWith('/api/users/')) {
                const pathParts = request.url.split('/');
                const userId = pathParts[3];
                if (pathParts[4] === 'coins') return sendJson(response, 200, accounts.getCoinBalance(userId));
                if (pathParts[4] === 'matches') return sendJson(response, 200, { matches: accounts.getMatchHistory(userId) });
                return sendJson(response, 200, { user: accounts.getProfile(userId) });
            }
            if (request.method !== 'POST') return sendJson(response, 405, { error: '只支持 POST 请求。' });
            const body = await readJson(request);
            let room;
            // 注册 / 登录 / 游客：成功后连同令牌一起返回，客户端要保存 token 用于后续请求。
            if (request.url === '/api/auth/register') {
                const user = accounts.register(body);
                return sendJson(response, 201, { user, token: accounts.issueToken(user.id) });
            }
            if (request.url === '/api/auth/login') {
                const user = accounts.login(body);
                return sendJson(response, 200, { user, token: accounts.issueToken(user.id) });
            }
            if (request.url === '/api/auth/guest') {
                const user = accounts.createGuest();
                return sendJson(response, 201, { user, token: accounts.issueToken(user.id) });
            }
            if (request.url === '/api/auth/logout') {
                const header = request.headers.authorization || '';
                accounts.revokeToken(header.startsWith('Bearer ') ? header.slice(7).trim() : '');
                return sendJson(response, 200, { ok: true });
            }
            // 战绩上报必须登录，且分数由服务端按自己的牌局快照算，不接受客户端上报的数字。
            if (request.url === '/api/matches') {
                const userId = requireUserId(request);
                const settlement = rooms.settleRound(body.roomNumber);
                if (!settlement.playerResults.some(result => result.userId === userId)) {
                    throw new Error('你不在这个房间内，不能提交战绩。');
                }
                return sendJson(response, 201, { match: accounts.saveMatch(settlement) });
            }
            // 内部自动化部署接口（通过 X-Deploy-Secret 密钥鉴权，无需 SSH 密码）
            if (request.url === '/api/internal/deploy') {
                const deploySecret = process.env.DEPLOY_SECRET || 'mahjong_deploy_secret_2026_xiguazi';
                const headerSecret = request.headers['x-deploy-secret'] || '';
                if (!headerSecret || headerSecret !== deploySecret) {
                    return sendJson(response, 403, { error: '部署鉴权失败：密钥不匹配。' });
                }
                const { target, archiveBase64 } = body;
                if (!archiveBase64) throw new Error('缺少发布包数据。');

                const buffer = Buffer.from(archiveBase64, 'base64');
                const tmpPath = `/tmp/deploy_${Date.now()}.tar.gz`;
                fs.writeFileSync(tmpPath, buffer);

                if (target === 'frontend') {
                    const webDir = process.env.WEB_ROOT || '/var/www/mahjong';
                    execSync(`mkdir -p ${webDir} && tar -xzf ${tmpPath} -C ${webDir} && rm -f ${tmpPath}`);
                    return sendJson(response, 200, { ok: true, message: '前端静态资源更新成功！' });
                } else if (target === 'backend') {
                    const appDir = process.env.APP_DIR || '/opt/mahjong-server';
                    execSync(`mkdir -p ${appDir} && tar -xzf ${tmpPath} -C ${appDir} && rm -f ${tmpPath}`);
                    setTimeout(() => { process.exit(0); }, 500);
                    return sendJson(response, 200, { ok: true, message: '后端代码已更新，服务正在重启！' });
                } else {
                    throw new Error('未知的部署目标: ' + target);
                }
            }

            // 以下房间操作全部改用令牌身份：无论请求体里写谁的 playerId，
            // 服务端只认令牌换出来的 userId，因此没法替别人出牌或踢人。
            const actorId = requireUserId(request);
            if (request.url === '/api/rooms') room = rooms.createRoom({ ...body.player, id: actorId });
            else if (request.url === '/api/rooms/join') room = rooms.joinRoom(body.roomNumber, { ...body.player, id: actorId });
            else if (request.url === '/api/rooms/leave') room = rooms.leaveRoom(body.roomNumber, actorId);
            else if (request.url === '/api/rooms/ready') room = rooms.setReady(body.roomNumber, actorId, body.ready);
            else if (request.url === '/api/rooms/start') room = rooms.startGame(body.roomNumber, actorId);
            else if (request.url === '/api/rooms/discard') room = rooms.discardTile(body.roomNumber, actorId, body.tileId).room;
            else if (request.url === '/api/rooms/action') room = rooms.resolveAction(body.roomNumber, actorId, body.action).room;
            else if (request.url === '/api/rooms/reconnect') room = rooms.reconnectRoom(body.roomNumber, actorId);
            else return sendJson(response, 404, { error: '接口不存在。' });
            // 返回按本人视角过滤后的房间，别人的手牌不下发。
            // 房间号要从操作结果里取：创建房间时请求体里本来就没有 roomNumber。
            return sendJson(response, 200, { room: room ? rooms.getRoomViewFor(room.roomNumber, actorId) : room });
        } catch (error) {
            // 鉴权类失败回 401，客户端据此跳转登录页；其余业务错误仍回 400。
            const isAuthError = /请先登录|登录已失效/.test(error.message || '');
            return sendJson(response, isAuthError ? 401 : 400, { error: error.message });
        }
    });

    const realtime = attachWebSocketServer(server, (message, socket) => {
        if (message.type === 'ping') socket.write(Buffer.from([0x81, 0x04, 0x70, 0x6f, 0x6e, 0x67]));
        // 实时连接的第一步必须是 auth：把令牌换成服务端认定的真实 userId。
        // 后续 create/join 一律用这个 userId，客户端自称的 player.id 会被忽略。
        if (message.type === 'auth') {
            socket.userId = accounts.verifyToken(message.token);
            const profile = accounts.getProfile(socket.userId);
            socket.write(encodeWebSocketText({ type: 'authenticated', user: { id: profile.id, username: profile.username, coins: profile.coins } }));
        }
        if (message.type === 'room:create') {
            const userId = requireAuthenticatedSocket(socket);
            const room = rooms.createRoom({ ...message.player, id: userId });
            socket.roomNumber = room.roomNumber; socket.playerId = userId;
            socket.write(encodeWebSocketText({ type: 'room:created', room: rooms.getRoomViewFor(room.roomNumber, userId) }));
        }
        if (message.type === 'room:join') {
            const userId = requireAuthenticatedSocket(socket);
            const room = rooms.joinRoom(message.roomNumber, { ...message.player, id: userId });
            socket.roomNumber = room.roomNumber; socket.playerId = userId;
            broadcastRoomPerViewer(room.roomNumber);
        }
        if (message.type === 'room:ready') {
            requireBoundRoomPlayer(socket, message);
            const room = rooms.setReady(message.roomNumber, socket.playerId, message.ready);
            broadcastRoomPerViewer(room.roomNumber);
        }
        if (message.type === 'room:start') {
            requireBoundRoomPlayer(socket, message);
            // 不再接收 message.gameState：牌由服务端洗、由服务端发。
            const room = rooms.startGame(message.roomNumber, socket.playerId);
            broadcastRoomPerViewer(room.roomNumber, 'room:started');
        }
        if (message.type === 'room:leave') {
            requireBoundRoomPlayer(socket, message);
            const room = rooms.leaveRoom(message.roomNumber, socket.playerId);
            if (room) broadcastRoomPerViewer(room.roomNumber);
            else broadcastRoom(message.roomNumber, { type: 'room:closed', roomNumber: message.roomNumber });
        }
        if (message.type === 'room:reconnect') {
            const userId = requireAuthenticatedSocket(socket);
            const room = rooms.reconnectRoom(message.roomNumber, userId);
            socket.roomNumber = room.roomNumber; socket.playerId = userId;
            socket.write(encodeWebSocketText({ type: 'room:reconnected', room: rooms.getRoomViewFor(room.roomNumber, userId) }));
        }
        if (message.type === 'game:discard') {
            requireBoundRoomPlayer(socket, message);
            const result = rooms.discardTile(message.roomNumber, socket.playerId, message.tileId);
            broadcastRoomPerViewer(result.room.roomNumber, 'game:discarded', { discarded: result.discarded });
        }
        if (message.type === 'game:action') {
            requireBoundRoomPlayer(socket, message);
            const result = rooms.resolveAction(message.roomNumber, socket.playerId, message.action);
            broadcastRoomPerViewer(result.room.roomNumber, 'game:actioned', { action: result.action, result: result.result });
        }
        if (message.type === 'room:chat') {
            requireBoundRoomPlayer(socket, message);
            const chat = rooms.createChatMessage(message.roomNumber, socket.playerId, message.text);
            broadcastRoom(chat.roomNumber, { type: 'room:chat', chat });
        }
    });

    return { server, accounts, rooms, realtime };
}
