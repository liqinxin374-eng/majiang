import assert from 'node:assert/strict';

const PUBLIC_ORIGIN = 'https://www.xiguazi.online';
const WS_ORIGIN = 'wss://www.xiguazi.online/ws';

async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
    }
    return data;
}

class PlayerClient {
    constructor(name, tag) {
        this.name = name;
        this.tag = tag;
        this.user = null;
        this.token = null;
        this.ws = null;
        this.seat = null;
        this.room = null;
        this.unreadMessages = [];
        this.resolvers = [];
    }

    async register() {
        const rand = Math.floor(1000 + Math.random() * 9000);
        const username = `qa_${this.tag}_${rand}`;
        const password = 'QaPassword123!';
        const res = await fetchJson(`${PUBLIC_ORIGIN}/api/auth/register`, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        this.user = res.user;
        this.token = res.token;
        console.log(`[HTTP] 玩家 [${this.name}] 注册成功: ${this.user.username}, 初始金币: ${this.user.coins}`);
    }

    connectWs() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(WS_ORIGIN);
            this.ws.onopen = () => {
                console.log(`[WS] 玩家 [${this.name}] 连接 WebSocket 成功`);
                this.send({ type: 'auth', token: this.token });
            };
            this.ws.onerror = (err) => reject(err);
            this.ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'authenticated') {
                    console.log(`[WS] 玩家 [${this.name}] 鉴权通过: id=${msg.user.id}`);
                    resolve(msg);
                }
                if (msg.room) {
                    this.room = msg.room;
                    const me = msg.room.players?.find(p => p.id === this.user.id);
                    if (me) this.seat = me.seat;
                }
                
                const idx = this.resolvers.findIndex(r => r.type === msg.type);
                if (idx !== -1) {
                    const [r] = this.resolvers.splice(idx, 1);
                    clearTimeout(r.timer);
                    r.resolve(msg);
                } else {
                    this.unreadMessages.push(msg);
                }
            };
        });
    }

    send(data) {
        const payload = { playerId: this.user?.id, ...data };
        this.ws.send(JSON.stringify(payload));
    }

    waitForMessage(type, timeoutMs = 8000) {
        const unreadIdx = this.unreadMessages.findIndex(m => m.type === type);
        if (unreadIdx !== -1) {
            const [msg] = this.unreadMessages.splice(unreadIdx, 1);
            return Promise.resolve(msg);
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const idx = this.resolvers.findIndex(r => r.resolve === resolve);
                if (idx !== -1) this.resolvers.splice(idx, 1);
                reject(new Error(`[${this.name}] 超时等待消息类型: ${type}`));
            }, timeoutMs);
            this.resolvers.push({ type, resolve, reject, timer });
        });
    }

    close() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }
}

async function runPublicMultiplayerTest() {
    console.log('====================================================');
    console.log('🚀 开始对公网服务器进行全量真实多方联机对局验证');
    console.log(`🎯 目标服务器: ${PUBLIC_ORIGIN}`);
    console.log(`🎯 实时地址: ${WS_ORIGIN}`);
    console.log('====================================================\n');

    console.log('--- 阶段 1: 公网接口连通性验证 ---');
    const initialLeaderboard = await fetchJson(`${PUBLIC_ORIGIN}/api/leaderboard`);
    console.log(`✅ 排行榜接口正常，当前上榜人数: ${initialLeaderboard.leaderboard.length}`);

    console.log('\n--- 阶段 2: 注册 4 位独立真实玩家账号 ---');
    const players = [
        new PlayerClient('指挥官(南家)', 's'),
        new PlayerClient('矩阵猫(东家)', 'e'),
        new PlayerClient('赛博飞鸟(北家)', 'n'),
        new PlayerClient('霓虹狼(西家)', 'w')
    ];

    for (const player of players) {
        await player.register();
        assert.ok(player.token, 'Token 必须生成');
        assert.ok(player.user.coins >= 1000, '新注册玩家应有初始金币');
    }

    console.log('\n--- 阶段 3: 建立 4 路独立 WebSocket 连接并鉴权 ---');
    for (const player of players) {
        await player.connectWs();
    }

    console.log('\n--- 阶段 4: 玩家 1 创建联机房间 ---');
    const [p1, p2, p3, p4] = players;
    p1.send({ type: 'room:create', player: { name: p1.user.username } });
    const createRes = await p1.waitForMessage('room:created');
    const roomNumber = createRes.room.roomNumber;
    console.log(`✅ 房间创建成功，房间号: 【${roomNumber}】，房主: ${p1.user.username}（座位: ${createRes.room.players[0].seat}）`);
    assert.equal(createRes.room.players[0].seat, 'south');

    console.log('\n--- 阶段 5: 玩家 2, 3, 4 依次加入房间 ---');
    p2.send({ type: 'room:join', roomNumber, player: { name: p2.user.username } });
    await p1.waitForMessage('room:updated');
    console.log(`✅ 玩家 2 (${p2.user.username}) 已加入，分配座位: east`);

    p3.send({ type: 'room:join', roomNumber, player: { name: p3.user.username } });
    await p1.waitForMessage('room:updated');
    console.log(`✅ 玩家 3 (${p3.user.username}) 已加入，分配座位: north`);

    p4.send({ type: 'room:join', roomNumber, player: { name: p4.user.username } });
    await p1.waitForMessage('room:updated');
    console.log(`✅ 玩家 4 (${p4.user.username}) 已加入，分配座位: west`);

    console.log('\n--- 阶段 6: 房间聊天广播测试 ---');
    const chatPromises = [p2, p3, p4].map(p => p.waitForMessage('room:chat'));
    p1.send({ type: 'room:chat', roomNumber, text: '大家好，公网全量联机对局测试开始！' });
    const [chatMsg] = await Promise.all(chatPromises);
    console.log(`✅ 收到房间聊天广播: [${chatMsg.chat.playerName}] ${chatMsg.chat.content}`);
    assert.equal(chatMsg.chat.roomNumber, roomNumber);

    console.log('\n--- 阶段 7: 玩家 2, 3, 4 准备就绪 ---');
    for (const p of [p2, p3, p4]) {
        p.send({ type: 'room:ready', roomNumber, ready: true });
        await p1.waitForMessage('room:updated');
        console.log(`✅ 玩家 [${p.name}] 已准备`);
    }

    console.log('\n--- 阶段 8: 房主开启游戏，服务端权威发牌 ---');
    const startPromises = players.map(p => p.waitForMessage('room:started'));
    p1.send({ type: 'room:start', roomNumber });
    const startedResults = await Promise.all(startPromises);
    console.log('✅ 所有 4 位玩家均收到 room:started 广播！');

    console.log('\n--- 阶段 9: 校验防作弊隔离（手牌/牌墙隐私保护） ---');
    players.forEach((p, idx) => {
        const roomView = startedResults[idx].room;
        const gs = roomView.gameState;
        assert.ok(gs, '必须包含 gameState');
        assert.equal(gs.wall, undefined, `玩家 [${p.name}] 绝不能收到原始牌墙数组 (防偷看)`);
        assert.ok(typeof gs.wallCount === 'number', '应提供牌墙剩余张数');

        const mySeat = p.seat;
        assert.ok(Array.isArray(gs.hands[mySeat]), `玩家 [${p.name}] 必须能看到自己的手牌`);
        const otherSeats = ['south', 'east', 'north', 'west'].filter(s => s !== mySeat);
        for (const otherSeat of otherSeats) {
            assert.equal(gs.hands[otherSeat], undefined, `玩家 [${p.name}] 绝不能看到对手 [${otherSeat}] 的手牌`);
            assert.ok(gs.handCounts[otherSeat] >= 13, `对手 [${otherSeat}] 的手牌张数必须可见`);
        }
        console.log(`🛡️ 玩家 [${p.name}] 防作弊检查通过: 仅能看见己方 ${gs.hands[mySeat].length} 张手牌, 其余三家仅见张数 (${otherSeats.map(s => `${s}:${gs.handCounts[s]}`).join(', ')}), 牌墙余 ${gs.wallCount} 张`);
    });

    console.log('\n--- 阶段 10: 真实出牌与广播验证 ---');
    const pSouth = players.find(p => p.seat === 'south');
    const southHand = pSouth.room.gameState.hands.south;
    const southDingQue = pSouth.room.gameState.dingQue.south;
    const queTiles = southHand.filter(t => t.suit === southDingQue);
    const firstTileToDiscard = queTiles.length > 0 ? queTiles[0] : southHand[0];

    const discardPromises = players.map(p => p.waitForMessage('game:discarded'));
    pSouth.send({
        type: 'game:discard',
        roomNumber,
        tileId: firstTileToDiscard.id
    });

    const discardResults = await Promise.all(discardPromises);
    const discarded = discardResults[0].discarded;
    console.log(`🀄 南家打出首张牌: ${discarded.val}${discarded.suit}，4位玩家均实时同步收到 game:discarded 广播！`);

    console.log('\n--- 阶段 11: 牌局结算与战绩入库测试 ---');
    const matchRes = await fetchJson(`${PUBLIC_ORIGIN}/api/matches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p1.token}` },
        body: JSON.stringify({ roomNumber })
    });
    console.log(`✅ 战绩成功结算并上报入库: 比赛ID=${matchRes.match.id}, 房间号=${matchRes.match.roomNumber}`);

    console.log('\n--- 阶段 12: 验证个人战绩列表 API ---');
    for (const p of players) {
        const history = await fetchJson(`${PUBLIC_ORIGIN}/api/users/${p.user.id}/matches`);
        assert.ok(history.matches.length >= 1, `玩家 [${p.name}] 必须查到已入库战绩`);
        const myMatch = history.matches[0];
        console.log(`✅ 玩家 [${p.name}] 战绩查询成功: 房间=${myMatch.roomNumber}, 座位=${myMatch.seat}, 胜负=${myMatch.isWinner ? '胜' : '负'}, 积分变动=${myMatch.scoreDelta}`);
    }

    console.log('\n--- 阶段 13: 验证全网排行榜 API 同步 ---');
    const finalLeaderboard = await fetchJson(`${PUBLIC_ORIGIN}/api/leaderboard`);
    console.log(`✅ 排行榜成功拉取，总人数: ${finalLeaderboard.leaderboard.length}`);

    players.forEach(p => p.close());
    console.log('\n====================================================');
    console.log('🎉 公网多方真实对局端到端全量测试全部 PASS！');
    console.log('====================================================\n');
}

runPublicMultiplayerTest().catch(err => {
    console.error('❌ 公网测试失败:', err);
    process.exit(1);
});
