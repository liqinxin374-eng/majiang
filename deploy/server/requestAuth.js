/**
 * 校验实时连接是否已绑定到当前房间和当前玩家。
 * 这样客户端即使篡改发送内容里的 playerId，也不能替别人操作。
 */
export function requireBoundRoomPlayer(socket, message) {
    if (!socket.roomNumber || !socket.playerId) throw new Error('请先创建、加入或恢复房间。');
    if (socket.roomNumber !== message.roomNumber) throw new Error('不能跨房间提交操作。');
    if (socket.playerId !== message.playerId) throw new Error('不能冒充其他玩家操作。');
}

/**
 * 校验实时连接已经通过令牌认证。
 *
 * 光有 requireBoundRoomPlayer 是不够的：它只比对"你自称的 id"和"你上次自称的 id"，
 * 两次都撒同一个谎就能通过。所以在 join / create 之前必须先 auth，
 * 由服务端把 socket.userId 钉死成令牌换出来的真实 userId。
 *
 * @param {{ userId?: string }} socket
 * @returns {string} 已认证的真实 userId
 */
export function requireAuthenticatedSocket(socket) {
    if (!socket.userId) throw new Error('请先登录。');
    return socket.userId;
}
