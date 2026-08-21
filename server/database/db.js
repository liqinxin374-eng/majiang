import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 这里是整个项目唯一接触 SQLite 驱动的地方。
 *
 * 为什么要收敛到一个文件：node:sqlite 在 Node 22 上还是实验特性（启动时会打
 * ExperimentalWarning，属于预期现象，不是报错）。万一将来要换成 better-sqlite3，
 * 只需要改这个文件，AccountService 和测试都不用动——因为两者的
 * prepare / run / all / get / exec 用法几乎一致。
 */

const SCHEMA_PATH = new URL('./schema.sql', import.meta.url);
export const DEFAULT_DATABASE_FILE = fileURLToPath(new URL('./mahjong.db', import.meta.url));

/** 内存库只在测试里用；真实运行一律落到磁盘文件。 */
export const MEMORY_DATABASE = ':memory:';

/**
 * 打开（必要时新建）数据库，并保证 schema.sql 里的表结构已经建好。
 *
 * @param {string} location 数据库文件路径，或 ':memory:'
 * @returns {DatabaseSync}
 */
export function openDatabase(location = DEFAULT_DATABASE_FILE) {
    if (location !== MEMORY_DATABASE) {
        // 头一次运行时 database 目录可能还不存在，先建好，避免 SQLITE_CANTOPEN。
        mkdirSync(dirname(location), { recursive: true });
    }

    const database = new DatabaseSync(location);

    // 外键约束默认是关的，必须显式打开，否则 schema.sql 里的 FOREIGN KEY 形同虚设。
    database.exec('PRAGMA foreign_keys = ON;');

    if (location !== MEMORY_DATABASE) {
        // WAL 模式让“读”和“写”不再互相阻塞，多个玩家同时结算时更稳。
        database.exec('PRAGMA journal_mode = WAL;');
        // NORMAL 在 WAL 下已经足够安全，同时避免每次写盘都等待 fsync。
        database.exec('PRAGMA synchronous = NORMAL;');
    }

    // 真正执行建表语句。注意这和只用正则去“读” schema.sql 是两回事：
    // 这里如果 SQL 写错了会立刻抛异常，不会出现“测试绿灯但表没建”的假象。
    database.exec(readFileSync(SCHEMA_PATH, 'utf8'));

    return database;
}
