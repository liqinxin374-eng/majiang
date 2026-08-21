import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../server/database/db.js';

const schema = readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8');

test('account schema contains users, coin ledger, and match history tables', () => {
    ['users', 'coin_transactions', 'matches', 'match_players'].forEach(table => {
        assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    });
    assert.match(schema, /coins INTEGER NOT NULL DEFAULT 1000/);
    assert.match(schema, /FOREIGN KEY \(user_id\) REFERENCES users/);
    // 每位玩家一份独立的盐，登录校验必须用到；缺了这一列，注册和登录都会失败。
    assert.match(schema, /password_salt TEXT/);
});

/**
 * 上面那条只是在“读文本”，它证明不了 SQL 真的能跑起来。
 * 下面这条会真的建一个内存库并执行 schema.sql——这正是之前 BUG-003 漏掉的那一层。
 */
test('schema actually executes and creates the four tables in a real database', () => {
    const database = openDatabase(':memory:');
    try {
        const tables = database
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .all()
            .map(row => row.name);
        ['coin_transactions', 'match_players', 'matches', 'users'].forEach(table => {
            assert.ok(tables.includes(table), `数据库里应该真的建出 ${table} 表，实际只有：${tables.join('、')}`);
        });

        const userColumns = database.prepare('PRAGMA table_info(users)').all().map(row => row.name);
        ['id', 'username', 'password_hash', 'password_salt', 'is_guest', 'coins'].forEach(column => {
            assert.ok(userColumns.includes(column), `users 表应该包含 ${column} 列`);
        });
    } finally {
        database.close();
    }
});

test('database rejects negative coin balances at the storage layer', () => {
    const database = openDatabase(':memory:');
    try {
        database.prepare('INSERT INTO users (id, username, coins) VALUES (?, ?, ?)').run('u-1', '余额守卫', 10);
        // 就算有人绕过 AccountService 直接写库，也不可能把金币改成负数。
        assert.throws(
            () => database.prepare('UPDATE users SET coins = ? WHERE id = ?').run(-1, 'u-1'),
            /CHECK constraint failed/i
        );
        assert.equal(database.prepare('SELECT coins FROM users WHERE id = ?').get('u-1').coins, 10);
    } finally {
        database.close();
    }
});
