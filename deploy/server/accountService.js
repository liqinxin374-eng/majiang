import crypto from 'node:crypto';
import { openDatabase, DEFAULT_DATABASE_FILE, MEMORY_DATABASE } from './database/db.js';

const INITIAL_COINS = 1000;
const VALID_SEATS = ['south', 'east', 'north', 'west'];
// 令牌有效期 30 天：手机端不必天天重新登录，又不会长期有效到永远。
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 账号服务：玩家账号、金币余额、金币流水、对局战绩。
 *
 * 数据全部落在 SQLite（server/database/schema.sql 定义的表）里，
 * 所以服务器重启之后金币和战绩都还在——这正是本次修复 BUG-003 的目的。
 *
 * 对外方法的名字、参数、返回结构和报错文案与内存版完全一致，
 * 换掉存储层不会影响 server/index.js 和已有测试。
 */
export class AccountService {
    /**
     * @param {{ databaseFile?: string }} [options] 传 ':memory:' 可得到一个用完即弃的测试库。
     */
    constructor(options = {}) {
        this.databaseFile = options.databaseFile ?? DEFAULT_DATABASE_FILE;
        this.database = openDatabase(this.databaseFile);
    }

    /** 关闭数据库连接。测试结束或进程退出时调用，避免临时库文件被占用。 */
    close() {
        this.database.close();
    }

    /**
     * 签发一枚会话令牌。
     *
     * 原始令牌只在这里出现一次并返回给客户端，数据库里只留 sha256 哈希。
     * 这样即使有人读到了 sessions 表，也不能拿哈希去冒充别人登录。
     *
     * @param {string} userId
     * @returns {string} 原始令牌，客户端要保存好，后续请求带上它
     */
    issueToken(userId) {
        this.#requireUserRow(userId);
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        this.database
            .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
            .run(this.#hashToken(token), userId, new Date().toISOString(), expiresAt);
        return token;
    }

    /**
     * 校验令牌并返回它所代表的用户编号。
     *
     * 这是「防手机端篡改」的地基：所有涉及金币和战绩的接口都必须先过这一关，
     * 拿到的 userId 来自服务端数据库，而不是客户端请求体里自称的那个。
     *
     * @param {string} token
     * @returns {string} 令牌对应的真实 userId
     */
    verifyToken(token) {
        if (typeof token !== 'string' || !token) throw new Error('请先登录。');
        const row = this.database
            .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
            .get(this.#hashToken(token));
        if (!row) throw new Error('登录已失效，请重新登录。');
        if (new Date(row.expires_at).getTime() <= Date.now()) {
            // 过期令牌顺手清掉，避免 sessions 表无限增长。
            this.database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(this.#hashToken(token));
            throw new Error('登录已失效，请重新登录。');
        }
        return row.user_id;
    }

    /** 退出登录：让这枚令牌立刻失效。 */
    revokeToken(token) {
        if (typeof token !== 'string' || !token) return false;
        const result = this.database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(this.#hashToken(token));
        return Number(result.changes) > 0;
    }

    #hashToken(token) {
        return crypto.createHash('sha256').update(String(token)).digest('hex');
    }

    register({ username, password }) {
        const normalizedName = String(username || '').trim();
        if (!/^[\u4e00-\u9fa5A-Za-z0-9_]{2,16}$/.test(normalizedName)) {
            throw new Error('昵称需为 2 到 16 个中文、字母、数字或下划线。');
        }
        if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
            throw new Error('密码长度需为 6 到 64 个字符。');
        }
        if (this.#findUserByName(normalizedName)) throw new Error('该昵称已被使用。');

        const id = crypto.randomUUID();
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
        this.#insertUser({ id, username: normalizedName, passwordHash, passwordSalt: salt, isGuest: 0 });
        this.#insertTransaction({ userId: id, amount: INITIAL_COINS, balanceAfter: INITIAL_COINS, reason: '注册赠送', roomNumber: null });
        return this.#publicUser(this.#requireUserRow(id));
    }

    login({ username, password }) {
        const normalizedName = String(username || '').trim();
        const user = this.#findUserByName(normalizedName);
        // 不管是“昵称不存在”还是“密码不对”，都回同一句话，避免被人拿来试探哪些昵称已注册。
        if (!user || typeof password !== 'string' || !user.password_hash || !user.password_salt) {
            throw new Error('昵称或密码错误。');
        }

        const attemptedHash = crypto.scryptSync(password, user.password_salt, 64).toString('hex');
        const matched = crypto.timingSafeEqual(Buffer.from(attemptedHash, 'hex'), Buffer.from(user.password_hash, 'hex'));
        if (!matched) throw new Error('昵称或密码错误。');
        return this.#publicUser(user);
    }

    createGuest() {
        let username;
        do {
            username = `游客${crypto.randomInt(100000, 1000000)}`;
        } while (this.#findUserByName(username));

        const id = crypto.randomUUID();
        this.#insertUser({ id, username, passwordHash: null, passwordSalt: null, isGuest: 1 });
        this.#insertTransaction({ userId: id, amount: INITIAL_COINS, balanceAfter: INITIAL_COINS, reason: '游客登录赠送', roomNumber: null });
        return this.#publicUser(this.#requireUserRow(id));
    }

    getTransactions(userId) {
        return this.database
            .prepare('SELECT id, user_id, amount, balance_after, reason, room_number FROM coin_transactions WHERE user_id = ? ORDER BY rowid ASC')
            .all(userId)
            .map(row => {
                const transaction = { id: row.id, userId: row.user_id, amount: row.amount, balanceAfter: row.balance_after, reason: row.reason };
                if (row.room_number !== null) transaction.roomNumber = row.room_number;
                return transaction;
            });
    }

    getProfile(userId) {
        const user = this.#requireUserRow(userId);
        return { ...this.#publicUser(user), createdAt: user.created_at, stats: this.#readStats(userId) };
    }

    getCoinBalance(userId) {
        const user = this.#requireUserRow(userId);
        return { userId: user.id, coins: user.coins };
    }

    recordRoundCoinChanges(roomNumber, changes) {
        if (!roomNumber) throw new Error('需要提供房间号。');
        if (!Array.isArray(changes) || changes.length === 0) throw new Error('需要提供至少一条金币变化。');

        // 先完整检查，确保不能出现“前两人已扣钱，第三人余额不足”的半完成结算。
        const prepared = changes.map(change => {
            const user = this.#findUserRow(change.userId);
            const amount = Number(change.amount);
            if (!user) throw new Error('结算玩家不存在。');
            if (!Number.isInteger(amount) || amount === 0) throw new Error('金币变化必须是非零整数。');
            if (user.coins + amount < 0) throw new Error('金币不足，无法完成本局结算。');
            return { userId: user.id, amount, reason: change.reason || '对局结算' };
        });

        // 事务是第二道保险：万一同一个人在一批里出现多次、逐笔扣成了负数，
        // 数据库的 CHECK (coins >= 0) 会拦下来，整批一起回滚，不会只扣一半。
        this.database.exec('BEGIN IMMEDIATE');
        try {
            const records = prepared.map(({ userId, amount, reason }) => {
                this.database.prepare('UPDATE users SET coins = coins + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(amount, userId);
                const balanceAfter = this.#requireUserRow(userId).coins;
                return this.#insertTransaction({ userId, amount, balanceAfter, reason, roomNumber: String(roomNumber) });
            });
            this.database.exec('COMMIT');
            return records;
        } catch (error) {
            this.database.exec('ROLLBACK');
            if (/CHECK constraint failed/i.test(error.message)) throw new Error('金币不足，无法完成本局结算。');
            throw error;
        }
    }

    saveMatch({ roomNumber, playerResults }) {
        if (!roomNumber) throw new Error('需要提供房间号。');
        if (!Array.isArray(playerResults) || playerResults.length !== 4) throw new Error('一局战绩必须包含四名玩家。');
        const seats = new Set();
        const users = new Set();
        playerResults.forEach(result => {
            if (!this.#findUserRow(result.userId)) throw new Error('战绩玩家不存在。');
            if (!VALID_SEATS.includes(result.seat)) throw new Error('玩家座位不合法。');
            if (seats.has(result.seat) || users.has(result.userId)) throw new Error('战绩中存在重复玩家或座位。');
            if (!Number.isInteger(result.scoreDelta)) throw new Error('战绩分数必须是整数。');
            seats.add(result.seat); users.add(result.userId);
        });

        const id = crypto.randomUUID();
        const finishedAt = new Date().toISOString();
        const players = playerResults.map(result => ({
            userId: result.userId, seat: result.seat, scoreDelta: result.scoreDelta, isWinner: Boolean(result.isWinner)
        }));

        this.database.exec('BEGIN IMMEDIATE');
        try {
            const inserted = this.database
                .prepare('INSERT INTO matches (id, room_number, status, started_at, finished_at) VALUES (?, ?, ?, ?, ?)')
                .run(id, String(roomNumber), 'finished', finishedAt, finishedAt);
            const insertPlayer = this.database
                .prepare('INSERT INTO match_players (match_id, user_id, seat, score_delta, is_winner) VALUES (?, ?, ?, ?, ?)');
            players.forEach(player => insertPlayer.run(id, player.userId, player.seat, player.scoreDelta, player.isWinner ? 1 : 0));
            this.database.exec('COMMIT');
            // rowid 由 SQLite 自动递增，重启后也不会倒退，正好当作“第几局”的序号。
            return { id, roomNumber: String(roomNumber), status: 'finished', finishedAt, sequence: Number(inserted.lastInsertRowid), players };
        } catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        }
    }

    getMatchHistory(userId, limit = 20) {
        this.#requireUserRow(userId);
        const normalizedLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 20));
        return this.database
            .prepare(`
                SELECT m.id, m.room_number, m.finished_at, m.status, p.user_id, p.seat, p.score_delta, p.is_winner
                FROM match_players p
                JOIN matches m ON m.id = p.match_id
                WHERE p.user_id = ?
                ORDER BY m.finished_at DESC, m.rowid DESC
                LIMIT ?
            `)
            .all(userId, normalizedLimit)
            .map(row => ({
                id: row.id,
                roomNumber: row.room_number,
                finishedAt: row.finished_at,
                status: row.status,
                userId: row.user_id,
                seat: row.seat,
                scoreDelta: row.score_delta,
                isWinner: Boolean(row.is_winner)
            }));
    }

    getLeaderboard(limit = 20) {
        const normalizedLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
        return this.database
            .prepare(`
                SELECT u.id, u.username, u.is_guest, u.coins,
                       (SELECT COUNT(*) FROM match_players WHERE user_id = u.id) AS games,
                       (SELECT COALESCE(SUM(is_winner), 0) FROM match_players WHERE user_id = u.id) AS wins
                FROM users u
            `)
            .all()
            // 昵称并列时按中文习惯排序，SQLite 自身做不到，所以取回来在 JS 里排。
            .sort((a, b) => b.coins - a.coins || b.wins - a.wins || a.username.localeCompare(b.username, 'zh-CN'))
            .slice(0, normalizedLimit)
            .map((row, index) => ({
                rank: index + 1,
                id: row.id,
                username: row.username,
                isGuest: Boolean(row.is_guest),
                coins: row.coins,
                stats: { games: row.games, wins: row.wins }
            }));
    }

    #insertUser({ id, username, passwordHash, passwordSalt, isGuest }) {
        this.database
            .prepare('INSERT INTO users (id, username, password_hash, password_salt, is_guest, coins, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(id, username, passwordHash, passwordSalt, isGuest, INITIAL_COINS, new Date().toISOString(), new Date().toISOString());
    }

    #insertTransaction({ userId, amount, balanceAfter, reason, roomNumber }) {
        const id = crypto.randomUUID();
        this.database
            .prepare('INSERT INTO coin_transactions (id, user_id, amount, balance_after, reason, room_number) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, userId, amount, balanceAfter, reason, roomNumber);
        const transaction = { id, userId, amount, balanceAfter, reason };
        if (roomNumber !== null) transaction.roomNumber = roomNumber;
        return transaction;
    }

    #findUserRow(userId) {
        if (typeof userId !== 'string' || !userId) return undefined;
        return this.database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    #requireUserRow(userId) {
        const user = this.#findUserRow(userId);
        if (!user) throw new Error('用户不存在。');
        return user;
    }

    #findUserByName(username) {
        return this.database.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username));
    }

    #readStats(userId) {
        const row = this.database
            .prepare('SELECT COUNT(*) AS games, COALESCE(SUM(is_winner), 0) AS wins FROM match_players WHERE user_id = ?')
            .get(userId);
        return { games: row.games, wins: row.wins };
    }

    #publicUser(user) {
        return { id: user.id, username: user.username, isGuest: Boolean(user.is_guest), coins: user.coins };
    }
}

export { MEMORY_DATABASE };
