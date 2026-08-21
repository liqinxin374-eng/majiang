import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountService } from '../server/accountService.js';

/**
 * BUG-003 的回归测试。
 *
 * 之前的 schema 测试只是用正则去“读” schema.sql 有没有那几行字，
 * 所以哪怕运行时压根没连数据库，测试也是绿的——典型的假阳性。
 *
 * 这里换一种问法，直接问业务上真正关心的那句话：
 * “把服务器关掉再打开，玩家的金币和战绩还在不在？”
 * 做法是先用一个临时 .db 文件写入数据、close()，
 * 再用同一个文件新建一个 AccountService 实例（等价于进程重启），然后逐项核对。
 */

const withTempDatabase = (run) => {
    const directory = mkdtempSync(join(tmpdir(), 'mahjong-db-'));
    const databaseFile = join(directory, 'mahjong.db');
    try {
        run(databaseFile);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
};

test('registered account survives a service restart with password still valid', () => {
    withTempDatabase(databaseFile => {
        const first = new AccountService({ databaseFile });
        const created = first.register({ username: '重启不丢', password: 'secure-pass-1' });
        first.close();

        // 相当于 Ctrl+C 之后重新 npm run server。
        const second = new AccountService({ databaseFile });
        try {
            const loggedIn = second.login({ username: '重启不丢', password: 'secure-pass-1' });
            assert.equal(loggedIn.id, created.id, '重启后应该还是同一个账号，而不是新建一个');
            assert.equal(loggedIn.coins, 1000);
            assert.throws(() => second.login({ username: '重启不丢', password: 'wrong-pass' }), /昵称或密码错误/);
            // 昵称唯一性也要跨重启生效，否则会出现两个同名账号。
            assert.throws(() => second.register({ username: '重启不丢', password: 'secure-pass-2' }), /昵称已被使用/);
        } finally {
            second.close();
        }
    });
});

test('coin balance and ledger survive a service restart', () => {
    withTempDatabase(databaseFile => {
        const first = new AccountService({ databaseFile });
        const winner = first.register({ username: 'Coin_Keeper', password: 'secure-pass-1' });
        const payer = first.register({ username: 'Coin_Payer', password: 'secure-pass-1' });
        first.recordRoundCoinChanges('200001', [
            { userId: winner.id, amount: 120, reason: '胡牌结算' },
            { userId: payer.id, amount: -120, reason: '胡牌赔付' }
        ]);
        first.close();

        const second = new AccountService({ databaseFile });
        try {
            assert.equal(second.getCoinBalance(winner.id).coins, 1120, '赢来的金币重启后必须还在');
            assert.equal(second.getCoinBalance(payer.id).coins, 880, '输掉的金币重启后不能自己长回来');
            const ledger = second.getTransactions(winner.id);
            assert.deepEqual(ledger.map(item => [item.amount, item.reason]), [[1000, '注册赠送'], [120, '胡牌结算']]);
            assert.equal(ledger[1].roomNumber, '200001', '流水要记得是哪个房间结算的');
            assert.equal(ledger[1].balanceAfter, 1120);
        } finally {
            second.close();
        }
    });
});

test('match history, statistics and leaderboard survive a service restart', () => {
    withTempDatabase(databaseFile => {
        const seats = ['south', 'east', 'north', 'west'];
        const first = new AccountService({ databaseFile });
        const players = ['Keep_S', 'Keep_E', 'Keep_N', 'Keep_W'].map(username => first.register({ username, password: 'secure-pass-1' }));
        first.saveMatch({
            roomNumber: '200010',
            playerResults: players.map((user, index) => ({ userId: user.id, seat: seats[index], scoreDelta: index === 0 ? 30 : -10, isWinner: index === 0 }))
        });
        first.recordRoundCoinChanges('200010', [{ userId: players[0].id, amount: 30 }]);
        first.close();

        const second = new AccountService({ databaseFile });
        try {
            const history = second.getMatchHistory(players[0].id);
            assert.equal(history.length, 1, '战绩重启后必须还查得到');
            assert.equal(history[0].roomNumber, '200010');
            assert.equal(history[0].seat, 'south');
            assert.equal(history[0].isWinner, true);
            assert.deepEqual(second.getProfile(players[0].id).stats, { games: 1, wins: 1 }, '胜场统计要能从战绩里重新算出来');
            assert.deepEqual(second.getProfile(players[1].id).stats, { games: 1, wins: 0 });

            const board = second.getLeaderboard(4);
            assert.equal(board[0].username, 'Keep_S');
            assert.equal(board[0].coins, 1030);
            assert.deepEqual(board[0].stats, { games: 1, wins: 1 });
        } finally {
            second.close();
        }
    });
});

test('failed settlement leaves no half-written data behind after restart', () => {
    withTempDatabase(databaseFile => {
        const first = new AccountService({ databaseFile });
        const one = first.register({ username: 'Rollback_One', password: 'secure-pass-1' });
        const two = first.register({ username: 'Rollback_Two', password: 'secure-pass-1' });
        assert.throws(() => first.recordRoundCoinChanges('200020', [
            { userId: one.id, amount: 5000 },
            { userId: two.id, amount: -5000 }
        ]), /金币不足/);
        first.close();

        const second = new AccountService({ databaseFile });
        try {
            // 结算失败就应该当作什么都没发生：余额不动，也不该留下半截流水。
            assert.equal(second.getCoinBalance(one.id).coins, 1000);
            assert.equal(second.getCoinBalance(two.id).coins, 1000);
            assert.equal(second.getTransactions(one.id).length, 1, '失败的结算不能写进流水');
            assert.equal(second.getTransactions(two.id).length, 1);
        } finally {
            second.close();
        }
    });
});

test('guest accounts are also persisted so their coins are not lost', () => {
    withTempDatabase(databaseFile => {
        const first = new AccountService({ databaseFile });
        const guest = first.createGuest();
        first.close();

        const second = new AccountService({ databaseFile });
        try {
            const profile = second.getProfile(guest.id);
            assert.equal(profile.username, guest.username);
            assert.equal(profile.isGuest, true);
            assert.equal(profile.coins, 1000);
            // 游客没有密码，任何人都不能用游客昵称登录别人的号。
            assert.throws(() => second.login({ username: guest.username, password: 'secure-pass-1' }), /昵称或密码错误/);
        } finally {
            second.close();
        }
    });
});
