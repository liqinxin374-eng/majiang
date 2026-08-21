import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PLAYER_ORDER,
    advanceToNextPlayer,
    autoDiscardForPlayer,
    canGang,
    canHu,
    chooseAutoDingQueSuit,
    createLocalRound,
    isRoundOver,
    performAutoReaction,
    performGang,
    performHu
} from '../src/mahjongCore.js';

const ROUND_COUNT = 100;
const MAX_STEPS_PER_ROUND = 600;

function countPhysicalTiles(gameState) {
    const zoneTiles = [
        ...gameState.wall,
        ...PLAYER_ORDER.flatMap(player => gameState.hands[player] || []),
        ...PLAYER_ORDER.flatMap(player => gameState.discards[player] || []),
        ...PLAYER_ORDER.flatMap(player => (gameState.melds[player] || []).flatMap(meld => meld.tiles))
    ];
    const discardWins = (gameState.huRecords || [])
        .filter(record => !record.isSelfDraw)
        .map(record => record.tile);

    return {
        count: zoneTiles.length + discardWins.length,
        ids: [...zoneTiles, ...discardWins].map(tile => tile.id)
    };
}

function createProgressFingerprint(gameState) {
    return JSON.stringify({
        phase: gameState.phase,
        currentPlayer: gameState.currentPlayer,
        wall: gameState.wall.length,
        hands: PLAYER_ORDER.map(player => gameState.hands[player].length),
        discards: PLAYER_ORDER.map(player => gameState.discards[player].length),
        melds: PLAYER_ORDER.map(player => gameState.melds[player].length),
        winners: [...gameState.winners],
        lastDiscard: gameState.lastDiscard?.tile?.id || ''
    });
}

function validateRoundState(gameState, roundNumber, stepNumber) {
    const physicalTiles = countPhysicalTiles(gameState);
    assert.equal(
        physicalTiles.count,
        108,
        `第 ${roundNumber} 盘第 ${stepNumber} 步牌数不守恒`
    );
    assert.equal(
        new Set(physicalTiles.ids).size,
        physicalTiles.ids.length,
        `第 ${roundNumber} 盘第 ${stepNumber} 步出现重复牌`
    );
    assert.ok(
        PLAYER_ORDER.includes(gameState.currentPlayer),
        `第 ${roundNumber} 盘第 ${stepNumber} 步当前玩家无效`
    );
    assert.equal(
        new Set(gameState.winners).size,
        gameState.winners.length,
        `第 ${roundNumber} 盘第 ${stepNumber} 步胡牌玩家被重复记录`
    );
}

function finishWinningTurn(gameState) {
    if (gameState.phase === 'round_over') return;
    advanceToNextPlayer(gameState);
}

function runAutomatedRound(roundNumber) {
    const gameState = createLocalRound();
    const actions = {
        discard: 0,
        peng: 0,
        gang: 0,
        hu: 0,
        selfDrawHu: 0
    };

    PLAYER_ORDER.forEach(player => {
        gameState.dingQue[player] = chooseAutoDingQueSuit(gameState.hands[player]);
    });
    gameState.phase = 'playing';

    let stepNumber = 0;
    let previousFingerprint = '';
    let repeatedFingerprintCount = 0;

    while (gameState.phase !== 'round_over' && stepNumber < MAX_STEPS_PER_ROUND) {
        stepNumber += 1;
        validateRoundState(gameState, roundNumber, stepNumber);

        const fingerprint = createProgressFingerprint(gameState);
        if (fingerprint === previousFingerprint) {
            repeatedFingerprintCount += 1;
        } else {
            repeatedFingerprintCount = 0;
            previousFingerprint = fingerprint;
        }
        assert.ok(
            repeatedFingerprintCount < 2,
            `第 ${roundNumber} 盘第 ${stepNumber} 步连续无进展，疑似机器人卡住`
        );

        const currentPlayer = gameState.currentPlayer;
        assert.ok(
            !gameState.winners.includes(currentPlayer),
            `第 ${roundNumber} 盘第 ${stepNumber} 步轮到了已经胡牌的玩家`
        );

        if (canHu(gameState, currentPlayer)) {
            const beforeHuRecords = gameState.huRecords.length;
            const result = performHu(gameState, currentPlayer);
            assert.ok(result, `第 ${roundNumber} 盘第 ${stepNumber} 步自摸判断成功但执行失败`);
            actions.hu += 1;
            if (gameState.huRecords.length > beforeHuRecords
                && gameState.huRecords.at(-1).isSelfDraw) {
                actions.selfDrawHu += 1;
            }
            finishWinningTurn(gameState);
            continue;
        }

        let gangCountThisTurn = 0;
        while (canGang(gameState, currentPlayer) && !gameState.lastDiscard) {
            const result = performGang(gameState, currentPlayer);
            assert.ok(result, `第 ${roundNumber} 盘第 ${stepNumber} 步杠牌判断成功但执行失败`);
            actions.gang += 1;
            gangCountThisTurn += 1;
            assert.ok(gangCountThisTurn <= 4, `第 ${roundNumber} 盘连续杠牌次数异常`);

            if (gameState.phase === 'round_over') break;
            if (canHu(gameState, currentPlayer)) {
                const huResult = performHu(gameState, currentPlayer);
                assert.ok(huResult, `第 ${roundNumber} 盘杠后自摸执行失败`);
                actions.hu += 1;
                actions.selfDrawHu += 1;
                finishWinningTurn(gameState);
                break;
            }
        }
        if (gameState.phase === 'round_over' || gameState.winners.includes(currentPlayer)) continue;

        const discarded = autoDiscardForPlayer(gameState, currentPlayer, 'advanced');
        assert.ok(discarded, `第 ${roundNumber} 盘第 ${stepNumber} 步机器人没有可出的牌`);
        actions.discard += 1;
        gameState.phase = 'reaction';

        const reaction = performAutoReaction(gameState, PLAYER_ORDER);
        if (!reaction) {
            advanceToNextPlayer(gameState);
            continue;
        }

        actions[reaction.action] += 1;
        if (reaction.action === 'hu') {
            finishWinningTurn(gameState);
        }
    }

    assert.ok(
        stepNumber < MAX_STEPS_PER_ROUND,
        `第 ${roundNumber} 盘超过 ${MAX_STEPS_PER_ROUND} 步仍未结束`
    );
    const roundStatus = isRoundOver(gameState);
    assert.equal(roundStatus.over, true, `第 ${roundNumber} 盘退出循环时尚未结束`);
    validateRoundState(gameState, roundNumber, stepNumber);

    return {
        roundNumber,
        steps: stepNumber,
        endReason: gameState.endReason || roundStatus.reason,
        winners: gameState.winners.length,
        wallLeft: gameState.wall.length,
        actions
    };
}

test('100盘机器人完整对局不会卡住、丢牌或重复牌', () => {
    const summaries = [];
    for (let roundNumber = 1; roundNumber <= ROUND_COUNT; roundNumber += 1) {
        summaries.push(runAutomatedRound(roundNumber));
    }

    const totals = summaries.reduce((result, summary) => {
        result.steps += summary.steps;
        result.winners += summary.winners;
        Object.keys(result.actions).forEach(action => {
            result.actions[action] += summary.actions[action];
        });
        result.endReasons[summary.endReason] = (result.endReasons[summary.endReason] || 0) + 1;
        return result;
    }, {
        rounds: summaries.length,
        steps: 0,
        winners: 0,
        actions: { discard: 0, peng: 0, gang: 0, hu: 0, selfDrawHu: 0 },
        endReasons: {}
    });

    console.log(`100盘对局汇总：${JSON.stringify(totals)}`);
    assert.equal(summaries.length, ROUND_COUNT);
});
