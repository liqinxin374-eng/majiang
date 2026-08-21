-- 科幻四川麻将：账号、金币、战绩数据库结构
-- 本文件使用 SQLite 语法，后续可平滑迁移到 MySQL。

PRAGMA foreign_keys = ON;

-- 玩家账号表：像每位玩家的“游戏身份证”。
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    -- 每位玩家一份独立“盐”，即使两人密码相同，存下来的哈希也完全不同。
    password_salt TEXT,
    is_guest INTEGER NOT NULL DEFAULT 0 CHECK (is_guest IN (0, 1)),
    coins INTEGER NOT NULL DEFAULT 1000 CHECK (coins >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 会话令牌表：登录成功后签发一枚令牌，后续请求靠它证明“我是谁”。
-- 只存令牌的哈希，即使数据库被人看到也无法反推出原始令牌（同 password_hash 的思路）。
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 金币流水表：每次金币增减都单独记一笔，不能只改余额而没有记录。
CREATE TABLE IF NOT EXISTS coin_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    reason TEXT NOT NULL,
    room_number TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 对局表：保存一局麻将的总体信息。
CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    room_number TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('playing', 'finished', 'abandoned')),
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT
);

-- 对局玩家表：保存每位玩家在该局中的座位、分数、名次和是否获胜。
CREATE TABLE IF NOT EXISTS match_players (
    match_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    seat TEXT NOT NULL CHECK (seat IN ('south', 'east', 'north', 'west')),
    score_delta INTEGER NOT NULL DEFAULT 0,
    rank INTEGER,
    is_winner INTEGER NOT NULL DEFAULT 0 CHECK (is_winner IN (0, 1)),
    PRIMARY KEY (match_id, user_id),
    UNIQUE (match_id, seat),
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 排行榜和个人战绩查询会频繁使用这些字段，因此建立索引提升查询速度。
CREATE INDEX IF NOT EXISTS idx_users_coins ON users(coins DESC);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_created ON coin_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_players_user ON match_players(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
