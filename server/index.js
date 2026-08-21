import { networkInterfaces } from 'node:os';
import { createAppServer } from './createServer.js';

/**
 * 服务器启动入口。
 * 路由和实时逻辑都在 createServer.js 里，这里只负责“监听端口 + 打印怎么连”。
 */

// 账号、金币、战绩全部落库；换库只要设环境变量 MAHJONG_DB_FILE，不用改代码。
const { server, accounts } = createAppServer({ databaseFile: process.env.MAHJONG_DB_FILE || undefined });

const PORT = Number(process.env.PORT) || 3001;
// 监听 0.0.0.0 而不是 localhost，手机才连得进来；只听 localhost 的话同一局域网也访问不到。
const HOST = process.env.HOST || '0.0.0.0';

/** 找出本机的局域网 IP，直接告诉用户手机该填哪个地址，省得自己去查 ipconfig。 */
function findLanAddresses() {
    return Object.values(networkInterfaces())
        .flat()
        .filter(item => item && item.family === 'IPv4' && !item.internal)
        .map(item => item.address);
}

// 进程退出前关掉数据库，保证 WAL 内容完整落盘。
const shutdown = () => {
    try { accounts.close(); } catch { /* 已关闭则忽略 */ }
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
    console.log(`麻将房间服务器已启动：http://localhost:${PORT}，实时地址：ws://localhost:${PORT}/ws`);
    console.log(`账号数据库：${accounts.databaseFile}`);
    const addresses = findLanAddresses();
    if (addresses.length) {
        console.log('手机联机请用下面任一地址（手机要和本机在同一个 Wi-Fi）：');
        addresses.forEach(address => console.log(`  VITE_SERVER_ORIGIN=http://${address}:${PORT}`));
    }
});
