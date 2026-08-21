/**
 * 把服务端下发的「按视角过滤过的房间」翻译成界面能直接渲染的牌局。
 *
 * 为什么要单独一个文件：
 * 服务端为了防偷看，只发观看者自己的手牌，别人的牌只给张数、牌墙只给剩余数。
 * 渲染层却需要一个结构完整的 gameState（每个座位都有 hands 数组、wall 有长度），
 * 中间这层转换很容易写错——最典型的两个坑：
 *   1. 座位写死 south：服务端按加入顺序分座，第二个进房的人是东家，
 *      写死之后他看到的手牌根本不是自己的，点哪张都对不上。
 *   2. 直接读 hands[seat].length：别人的席位是 undefined，渲染时直接抛错白屏。
 * 这两个坑都只在「四个人分坐四方」的真实联机里才暴露，靠手点很难复现，
 * 所以把它抽出来做成可单测的纯函数，DOM 一点都不碰。
 */

export const PLAYER_SEATS = ['south', 'east', 'north', 'west'];

/** 找出观看者在这个房间坐哪一方；不在房里就返回 null（调用方据此判断要不要渲染）。 */
export function resolveViewerSeat(room, viewerId) {
    const player = room?.players?.find(item => item.id === viewerId);
    return player?.seat ?? null;
}

/**
 * 补全服务端过滤后的牌局。
 *
 * @param {object} room 服务端 getRoomViewFor 的返回值
 * @param {string} viewerId 当前玩家的用户编号
 * @returns {{gameState: object, seat: string, hand: Array}|null}
 *   不在房间内、或这局还没开始时返回 null。
 *
 * 别人的手牌用 null 占位而不是省略：界面要按张数画出背面牌，
 * 数量必须准确，但内容必须拿不到——这正是服务端保密的目的。
 */
export function normalizeServerGameState(room, viewerId) {
    if (!room?.gameState) return null;
    const seat = resolveViewerSeat(room, viewerId);
    if (!seat) return null;

    const state = structuredClone(room.gameState);
    state.hands = state.hands ?? {};
    PLAYER_SEATS.forEach(each => {
        if (Array.isArray(state.hands[each])) return;
        const count = Number(state.handCounts?.[each]) || 0;
        state.hands[each] = new Array(count).fill(null);
    });

    // 牌墙内容同样保密，只有剩余张数；渲染层读 wall.length 时用得上。
    if (!Array.isArray(state.wall)) {
        state.wall = new Array(Number(state.wallCount) || 0).fill(null);
    }

    return { gameState: state, seat, hand: state.hands[seat] };
}
