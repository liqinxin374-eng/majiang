import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountService } from '../server/accountService.js';

// 每个用例都用一个全新的内存库，互不干扰，也不会写到真实的 mahjong.db 上。
const createAccounts = () => new AccountService({ databaseFile: ':memory:' });

test('registration creates a player with initial coins and no exposed password', () => {
    const accounts = createAccounts();
    const user = accounts.register({ username: '新手玩家', password: 'secure-pass-1' });
    assert.equal(user.username, '新手玩家');
    assert.equal(user.coins, 1000);
    assert.equal('passwordHash' in user, false);
    assert.deepEqual(accounts.getTransactions(user.id).map(item => [item.amount, item.reason]), [[1000, '注册赠送']]);
});

test('registration rejects duplicate names and invalid credentials', () => {
    const accounts = createAccounts();
    accounts.register({ username: 'Player_1', password: 'secure-pass-1' });
    assert.throws(() => accounts.register({ username: 'player_1', password: 'another-pass' }), /昵称已被使用/);
    assert.throws(() => accounts.register({ username: 'a', password: 'secure-pass-1' }), /昵称需为/);
    assert.throws(() => accounts.register({ username: 'Player_2', password: '123' }), /密码长度/);
});

test('login accepts the registered password and hides whether credentials were wrong', () => {
    const accounts = createAccounts();
    accounts.register({ username: 'Login_Player', password: 'secure-pass-1' });
    assert.equal(accounts.login({ username: 'login_player', password: 'secure-pass-1' }).username, 'Login_Player');
    assert.throws(() => accounts.login({ username: 'Login_Player', password: 'wrong-pass' }), /昵称或密码错误/);
    assert.throws(() => accounts.login({ username: 'missing', password: 'secure-pass-1' }), /昵称或密码错误/);
});

test('guest login creates a unique temporary account with starter coins', () => {
    const accounts = createAccounts();
    const first = accounts.createGuest();
    const second = accounts.createGuest();
    assert.equal(first.isGuest, true);
    assert.match(first.username, /^游客\d{6}$/);
    assert.notEqual(first.username, second.username);
    assert.equal(first.coins, 1000);
    assert.equal(accounts.getTransactions(first.id)[0].reason, '游客登录赠送');
});

test('profile returns safe player details and baseline statistics', () => {
    const accounts = createAccounts();
    const user = accounts.register({ username: 'Profile_Player', password: 'secure-pass-1' });
    const profile = accounts.getProfile(user.id);
    assert.equal(profile.username, 'Profile_Player');
    assert.deepEqual(profile.stats, { games: 0, wins: 0 });
    assert.equal('passwordHash' in profile, false);
    assert.throws(() => accounts.getProfile('missing'), /用户不存在/);
});

test('coin balance reads the same stored value used by player profile', () => {
    const accounts = createAccounts();
    const user = accounts.register({ username: 'Coin_Player', password: 'secure-pass-1' });
    assert.deepEqual(accounts.getCoinBalance(user.id), { userId: user.id, coins: 1000 });
    assert.throws(() => accounts.getCoinBalance('missing'), /用户不存在/);
});

test('round settlement records every coin change atomically with room number', () => {
    const accounts = createAccounts();
    const winner = accounts.register({ username: 'Winner_Player', password: 'secure-pass-1' });
    const payer = accounts.register({ username: 'Payer_Player', password: 'secure-pass-1' });
    const records = accounts.recordRoundCoinChanges('100001', [
        { userId: winner.id, amount: 80, reason: '胡牌结算' },
        { userId: payer.id, amount: -80, reason: '胡牌赔付' }
    ]);
    assert.deepEqual(records.map(item => [item.amount, item.roomNumber]), [[80, '100001'], [-80, '100001']]);
    assert.equal(accounts.getCoinBalance(winner.id).coins, 1080);
    assert.equal(accounts.getCoinBalance(payer.id).coins, 920);
});

test('round settlement keeps all balances unchanged when one player lacks coins', () => {
    const accounts = createAccounts();
    const playerOne = accounts.register({ username: 'Safe_One', password: 'secure-pass-1' });
    const playerTwo = accounts.register({ username: 'Safe_Two', password: 'secure-pass-1' });
    assert.throws(() => accounts.recordRoundCoinChanges('100002', [
        { userId: playerOne.id, amount: 2000 }, { userId: playerTwo.id, amount: -2000 }
    ]), /金币不足/);
    assert.equal(accounts.getCoinBalance(playerOne.id).coins, 1000);
    assert.equal(accounts.getCoinBalance(playerTwo.id).coins, 1000);
});

test('match saving records four players and updates personal statistics', () => {
    const accounts = createAccounts();
    const users = ['South', 'East', 'North', 'West'].map(username => accounts.register({ username, password: 'secure-pass-1' }));
    const match = accounts.saveMatch({ roomNumber: '100003', playerResults: users.map((user, index) => ({
        userId: user.id, seat: ['south', 'east', 'north', 'west'][index], scoreDelta: index === 0 ? 30 : -10, isWinner: index === 0
    })) });
    assert.equal(match.status, 'finished');
    assert.equal(match.players.length, 4);
    assert.deepEqual(accounts.getProfile(users[0].id).stats, { games: 1, wins: 1 });
    assert.deepEqual(accounts.getProfile(users[1].id).stats, { games: 1, wins: 0 });
});

test('match history only returns the requesting player records in newest-first order', () => {
    const accounts = createAccounts();
    const users = ['History_S', 'History_E', 'History_N', 'History_W'].map(username => accounts.register({ username, password: 'secure-pass-1' }));
    const results = (winner) => users.map((user, index) => ({ userId: user.id, seat: ['south', 'east', 'north', 'west'][index], scoreDelta: index === winner ? 30 : -10, isWinner: index === winner }));
    accounts.saveMatch({ roomNumber: '100010', playerResults: results(0) });
    accounts.saveMatch({ roomNumber: '100011', playerResults: results(1) });
    const history = accounts.getMatchHistory(users[0].id, 1);
    assert.equal(history.length, 1);
    assert.equal(history[0].roomNumber, '100011');
    assert.equal(history[0].seat, 'south');
    assert.throws(() => accounts.getMatchHistory('missing'), /用户不存在/);
});

test('leaderboard ranks players by coins and then win count', () => {
    const accounts = createAccounts();
    const alpha = accounts.register({ username: 'Rank_Alpha', password: 'secure-pass-1' });
    const beta = accounts.register({ username: 'Rank_Beta', password: 'secure-pass-1' });
    const gamma = accounts.register({ username: 'Rank_Gamma', password: 'secure-pass-1' });
    const delta = accounts.register({ username: 'Rank_Delta', password: 'secure-pass-1' });
    accounts.recordRoundCoinChanges('100020', [{ userId: alpha.id, amount: 30 }]);

    // 胜场必须通过公开接口“真的打几局”造出来，而不是直接改内部字段。
    // 这样一旦战绩统计断了，这个用例会跟着变红，而不是被内部赋值掩盖过去。
    const seats = ['south', 'east', 'north', 'west'];
    const order = [alpha, beta, gamma, delta];
    const playMatch = (roomNumber, winner) => accounts.saveMatch({
        roomNumber,
        playerResults: order.map((user, index) => ({
            userId: user.id, seat: seats[index], scoreDelta: user.id === winner.id ? 30 : -10, isWinner: user.id === winner.id
        }))
    });
    playMatch('100021', beta);
    playMatch('100022', beta);
    playMatch('100023', gamma);

    assert.deepEqual(accounts.getProfile(beta.id).stats, { games: 3, wins: 2 });
    assert.deepEqual(accounts.getProfile(gamma.id).stats, { games: 3, wins: 1 });

    // 金币最多的 alpha 排第一；beta 与 gamma 金币相同（存战绩不改金币），靠胜场分出 beta 在前。
    const board = accounts.getLeaderboard(2);
    assert.deepEqual(board.map(item => item.username), ['Rank_Alpha', 'Rank_Beta']);
    assert.deepEqual(board.map(item => item.rank), [1, 2]);
});
