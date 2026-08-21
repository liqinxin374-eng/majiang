import { randomInt } from 'node:crypto';
import {
    advanceToNextPlayer,
    canGang,
    canHu,
    canPeng,
    chooseAutoDingQueSuit,
    createMahjongWall,
    dealInitialHands,
    discardFromHand,
    getAvailableGang,
    getRoundSettlement,
    performGang,
    performHu,
    performPeng,
    shuffleTiles
} from '../src/mahjongCore.js';

const MAX_PLAYERS = 4;
const PLAYER_SEATS = ['south', 'east', 'north', 'west'];

export class RoomService {
    constructor() { this.rooms = new Map(); this.nextRoomNumber = 100000; }
    createRoom(host) {
        const player = this.#createPlayer(host, true);
        const room = { roomNumber: String(this.nextRoomNumber++), ownerId: player.id, status: 'waiting', players: [player], gameState: null };
        this.rooms.set(room.roomNumber, room);
        return this.getRoom(room.roomNumber);
    }
    joinRoom(roomNumber, playerInfo) {
        const room = this.#get(roomNumber);
        if (room.status !== 'waiting') throw new Error('牌局已经开始，暂时不能加入。');
        if (room.players.length >= MAX_PLAYERS) throw new Error('房间已满，最多只能有 4 名玩家。');
        if (room.players.some(player => player.id === playerInfo.id)) throw new Error('你已经在这个房间里。');
        room.players.push(this.#createPlayer(playerInfo, false, PLAYER_SEATS[room.players.length]));
        return this.getRoom(roomNumber);
    }
    leaveRoom(roomNumber, playerId) {
        const room = this.#get(roomNumber);
        room.players = room.players.filter(player => player.id !== playerId);
        if (!room.players.length) { this.rooms.delete(String(roomNumber)); return null; }
        if (room.ownerId === playerId) room.ownerId = room.players[0].id;
        return this.getRoom(roomNumber);
    }
    setReady(roomNumber, playerId, ready) {
        const player = this.#get(roomNumber).players.find(item => item.id === playerId);
        if (!player) throw new Error('玩家不在这个房间内。');
        player.ready = Boolean(ready);
        return this.getRoom(roomNumber);
    }
    /**
     * 开始游戏。**牌一律由服务端洗、由服务端发。**
     *
     * 以前这里直接 structuredClone(客户端传来的 gameState)，等于房主说什么牌就是什么牌——
     * 改装过的手机端可以给自己发一副天听牌。现在客户端传什么都不看，
     * 服务端自己 createMahjongWall + shuffleTiles + dealInitialHands，
     * 这样谁也没法预知或指定牌墙。
     */
    startGame(roomNumber, playerId) {
        const room = this.#get(roomNumber);
        if (room.ownerId !== playerId) throw new Error('只有房主可以开始游戏。');
        if (room.players.length !== MAX_PLAYERS) throw new Error('需要 4 名玩家才能开始。');
        if (!room.players.every(player => player.ready)) throw new Error('所有玩家准备后才能开始。');
        room.status = 'playing';
        room.gameState = this.#createAuthoritativeGameState();
        return this.getRoom(roomNumber);
    }

    /** 服务端权威发牌：洗一副新牌墙，发初始手牌，并按手牌自动定缺。 */
    #createAuthoritativeGameState(dealer = 'south') {
        // shuffleTiles 内部用 Math.random 只做展示层洗牌；这里再叠一层
        // crypto 强随机重排，避免有人靠预测随机数种子推算牌墙顺序。
        const shuffled = this.#cryptoShuffle(shuffleTiles(createMahjongWall()));
        const { hands, wall } = dealInitialHands(shuffled, dealer);
        const dingQue = {};
        PLAYER_SEATS.forEach(seat => { dingQue[seat] = chooseAutoDingQueSuit(hands[seat] || []); });
        return {
            phase: 'playing',
            dealer,
            currentPlayer: dealer,
            hands,
            wall,
            dingQue,
            melds: PLAYER_SEATS.reduce((all, seat) => ({ ...all, [seat]: [] }), {}),
            discards: PLAYER_SEATS.reduce((all, seat) => ({ ...all, [seat]: [] }), {}),
            lastDiscard: null,
            huRecords: [],
            gangSettlements: []
        };
    }

    /** Fisher-Yates + crypto 强随机，牌墙顺序不可预测。 */
    #cryptoShuffle(tiles) {
        const result = [...tiles];
        for (let index = result.length - 1; index > 0; index--) {
            const swapWith = randomInt(index + 1);
            [result[index], result[swapWith]] = [result[swapWith], result[index]];
        }
        return result;
    }

    /**
     * 由服务端自己的 gameState 计算本局结算。
     *
     * 关键点：分数来自服务端保存的牌局快照，不接受客户端上报的任何数字。
     * 客户端只能"请求结算"，算多少分由服务端说了算。
     */
    settleRound(roomNumber) {
        const room = this.#get(roomNumber);
        if (!room.gameState) throw new Error('牌局尚未开始，不能结算。');
        const { scoreDeltas, details } = getRoundSettlement(room.gameState);
        const playerResults = room.players.map(player => ({
            userId: player.id,
            seat: player.seat,
            scoreDelta: scoreDeltas[player.seat] ?? 0,
            isWinner: (room.gameState.huRecords || []).some(record => record.player === player.seat)
        }));
        return { roomNumber: room.roomNumber, playerResults, details };
    }
    /**
     * 【仅服务端内部使用】直接写入牌局快照。
     *
     * 用途：单元测试要搭建"某人手里正好有两张幺鸡"这类特定牌型，
     * 以及将来服务端自己推进牌局时替换快照。
     *
     * 安全性说明：这个方法**不对外暴露**——HTTP 与 WebSocket 层都不会把
     * 客户端数据传进来（startGame 已改为服务端自己发牌，updateGameState 直接拒绝）。
     * 攻击面在网络边界，那里已经封住了。
     */
    seedGameState(roomNumber, gameState) {
        const room = this.#get(roomNumber);
        room.status = 'playing';
        room.gameState = structuredClone(gameState);
        return this.getRoom(roomNumber);
    }

    /**
     * 【已停用】过去允许客户端整体覆写服务端牌局快照。
     *
     * 这是最直接的作弊入口：改装客户端可以把自己的手牌换成想要的任意牌。
     * 牌局状态现在只能由服务端在 discardTile / resolveAction 里推进，
     * 保留此方法只为让老客户端得到一句明确的拒绝，而不是静默被接受。
     */
    updateGameState() {
        throw new Error('牌局状态由服务器维护，客户端不能直接覆写。');
    }
    discardTile(roomNumber, playerId, tileId) {
        const room = this.#get(roomNumber);
        if (room.status !== 'playing') throw new Error('牌局尚未开始，不能出牌。');
        const player = room.players.find(item => item.id === playerId);
        if (!player) throw new Error('玩家不在这个房间内。');

        const gameState = room.gameState;
        if (!gameState || gameState.phase !== 'playing') throw new Error('当前不在出牌阶段。');
        if (gameState.currentPlayer !== player.seat) throw new Error('还没有轮到你出牌。');

        const hand = gameState.hands?.[player.seat] || [];
        const tileIndex = hand.findIndex(tile => tile.id === tileId);
        if (tileIndex === -1) throw new Error('手牌中没有这张牌。');

        const dingQueSuit = gameState.dingQue?.[player.seat] || '';
        const hasDingQueTile = dingQueSuit && hand.some(tile => tile.suit === dingQueSuit);
        if (hasDingQueTile && hand[tileIndex].suit !== dingQueSuit) throw new Error('还有定缺花色的牌，必须优先打出。');

        const discarded = discardFromHand(gameState, player.seat, tileIndex);
        gameState.phase = 'reaction';
        return { room: this.getRoom(roomNumber), discarded: structuredClone(discarded) };
    }
    resolveAction(roomNumber, playerId, action) {
        const room = this.#get(roomNumber);
        if (room.status !== 'playing') throw new Error('牌局尚未开始，不能执行操作。');
        const player = room.players.find(item => item.id === playerId);
        if (!player) throw new Error('玩家不在这个房间内。');

        const gameState = room.gameState;
        if (!gameState || !['playing', 'reaction'].includes(gameState.phase)) throw new Error('当前不在可操作阶段。');
        const isReaction = gameState.phase === 'reaction';
        if (isReaction && (!gameState.lastDiscard || gameState.lastDiscard.player === player.seat)) throw new Error('当前没有可响应的弃牌。');
        if (!isReaction && gameState.currentPlayer !== player.seat) throw new Error('还没有轮到你操作。');

        let result = null;
        if (action === 'peng') {
            if (!isReaction || !canPeng(gameState, player.seat)) throw new Error('当前不能碰牌。');
            result = performPeng(gameState, player.seat);
        } else if (action === 'gang') {
            const gang = getAvailableGang(gameState, player.seat);
            if (!canGang(gameState, player.seat) || (isReaction && gang.type !== 'ming_gang')) throw new Error('当前不能杠牌。');
            result = performGang(gameState, player.seat);
        } else if (action === 'hu') {
            if (!canHu(gameState, player.seat)) throw new Error('当前不能胡牌。');
            result = performHu(gameState, player.seat);
            if (gameState.phase !== 'round_over') advanceToNextPlayer(gameState);
        } else {
            throw new Error('不支持的牌局操作。');
        }

        return { room: this.getRoom(roomNumber), action, result: structuredClone(result) };
    }
    reconnectRoom(roomNumber, playerId) {
        const room = this.#get(roomNumber);
        if (!room.players.some(player => player.id === playerId)) throw new Error('该玩家不属于这个房间，无法重连。');
        // 返回深拷贝的房间和牌局快照，让新连接恢复到服务器当前状态。
        return this.getRoom(roomNumber);
    }
    createChatMessage(roomNumber, playerId, text) {
        const room = this.#get(roomNumber);
        const player = room.players.find(item => item.id === playerId);
        if (!player) throw new Error('玩家不在这个房间内。');
        const content = String(text || '').trim();
        if (!content) throw new Error('聊天内容不能为空。');
        if (content.length > 60) throw new Error('聊天内容不能超过 60 个字。');
        return { roomNumber: room.roomNumber, playerId: player.id, playerName: player.name, seat: player.seat, content };
    }
    getGameState(roomNumber) {
        const room = this.#get(roomNumber);
        return room.gameState === null ? null : structuredClone(room.gameState);
    }
    getRoom(roomNumber) { const room = this.rooms.get(String(roomNumber)); return room ? structuredClone(room) : null; }

    /**
     * 取「某位玩家视角」的房间快照：只看得到自己的手牌，其余人只给张数。
     *
     * 之前广播的是完整 gameState，手机端把收到的 JSON 打印出来就能看穿三家底牌——
     * 这属于严重的信息泄露，光靠界面不显示是挡不住的，必须在服务端就删掉。
     *
     * @param {string} roomNumber
     * @param {string} viewerId 观看者的玩家编号
     */
    getRoomViewFor(roomNumber, viewerId) {
        const room = this.getRoom(roomNumber);
        if (!room) return null;
        if (!room.gameState) return room;

        const viewer = room.players.find(player => player.id === viewerId);
        const viewerSeat = viewer?.seat;
        const hands = {};
        const handCounts = {};
        Object.entries(room.gameState.hands || {}).forEach(([seat, tiles]) => {
            handCounts[seat] = tiles.length;
            // 只把观看者自己的牌面发出去，别人的牌一张都不给。
            if (seat === viewerSeat) hands[seat] = tiles;
        });

        room.gameState = {
            ...room.gameState,
            hands,
            handCounts,
            // 牌墙内容同样保密，只告诉还剩几张，否则可以算出接下来会摸到什么。
            wall: undefined,
            wallCount: (room.gameState.wall || []).length
        };
        return room;
    }
    #get(roomNumber) { const room = this.rooms.get(String(roomNumber)); if (!room) throw new Error('房间不存在或已解散。'); return room; }
    #createPlayer(info, isOwner = false, seat = 'south') { if (!info?.id || !info?.name) throw new Error('玩家需要提供 id 和昵称。'); return { id: info.id, name: info.name, seat, ready: isOwner }; }
}
