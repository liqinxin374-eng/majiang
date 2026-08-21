export const TILE_SUITS = ['wan', 'tiao', 'tong'];
export const PLAYER_ORDER = ['south', 'east', 'north', 'west'];

export function createTile(suit, val, copy) {
    return {
        id: `${suit}-${val}-${copy}`,
        suit,
        val,
        copy
    };
}

export function isSameTileFace(a, b) {
    return Boolean(a && b && a.suit === b.suit && a.val === b.val);
}

export function createMahjongWall() {
    const wall = [];

    TILE_SUITS.forEach(suit => {
        for (let val = 1; val <= 9; val++) {
            for (let copy = 1; copy <= 4; copy++) {
                wall.push(createTile(suit, val, copy));
            }
        }
    });

    return wall;
}

export function shuffleTiles(tiles) {
    const shuffled = [...tiles];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
    }

    return shuffled;
}

export function sortTiles(tiles, dingQueSuit = '') {
    return [...tiles].sort((a, b) => {
        if (a.suit === dingQueSuit && b.suit !== dingQueSuit) return 1;
        if (a.suit !== dingQueSuit && b.suit === dingQueSuit) return -1;
        if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
        return a.val - b.val;
    });
}

export function getPlayerHandView(gameState, player) {
    const dingQueSuit = gameState.dingQue?.[player] || '';
    const sortedHand = sortTiles(gameState.hands?.[player] || [], dingQueSuit);
    const hasQueLeft = Boolean(dingQueSuit) && sortedHand.some(tile => tile.suit === dingQueSuit);

    return sortedHand.map((tile, index) => {
        const isQueTile = Boolean(dingQueSuit) && tile.suit === dingQueSuit;
        return {
            tile,
            index,
            disabled: hasQueLeft && !isQueTile,
            recommended: isQueTile
        };
    });
}

export function getOpponentHandBackViews(gameState) {
    return ['east', 'north', 'west'].map(player => {
        const tiles = gameState.hands?.[player] || [];
        return {
            player,
            tiles,
            isVertical: player === 'east' || player === 'west'
        };
    });
}

export function getDiscardPileViews(gameState) {
    return PLAYER_ORDER.map(player => ({
        player,
        tiles: gameState.discards?.[player] || []
    }));
}

export function getDingQueDisplayViews(gameState) {
    return PLAYER_ORDER.map(player => {
        const suit = gameState.dingQue?.[player] || '';
        const hasChosen = Boolean(suit);
        const suitName = hasChosen ? getQueName(suit) : '';

        return {
            player,
            suit,
            hasChosen,
            statusText: hasChosen ? `定缺：${suitName}` : '定缺：未选',
            badgeText: hasChosen ? `定缺：${suitName}` : '定缺'
        };
    });
}

export function chooseAutoDingQueSuit(hand) {
    const suitCounts = TILE_SUITS.map(suit => ({
        suit,
        count: hand.filter(tile => tile.suit === suit).length
    }));

    suitCounts.sort((a, b) => {
        if (a.count !== b.count) return a.count - b.count;
        return TILE_SUITS.indexOf(a.suit) - TILE_SUITS.indexOf(b.suit);
    });

    return suitCounts[0].suit;
}

export function applyFanCap(rawFan, maxFan = 4) {
    const normalizedRawFan = Math.max(0, Math.floor(Number(rawFan) || 0));
    const normalizedMaxFan = Math.max(0, Math.floor(Number(maxFan) || 4));
    const cappedFan = Math.min(normalizedRawFan, normalizedMaxFan);

    return {
        rawFan: normalizedRawFan,
        cappedFan,
        maxFan: normalizedMaxFan,
        isCapped: normalizedRawFan > normalizedMaxFan
    };
}

export function getHuFanDetails(tiles, isSelfDraw = false, maxFan = 4) {
    const fanTypes = [];
    let rawFan = 0;
    const pureOneSuit = isPureOneSuitHand(tiles);
    const dragonSevenPairs = isDragonSevenPairsHand(tiles);
    const sevenPairs = isSevenPairsHand(tiles);
    const allTriplets = isAllTripletsHand(tiles);

    if (dragonSevenPairs) {
        fanTypes.push({ name: pureOneSuit ? '清龙七对' : '龙七对', fan: pureOneSuit ? 8 : 5 });
        rawFan += pureOneSuit ? 8 : 5;
    } else if (sevenPairs) {
        fanTypes.push({ name: pureOneSuit ? '清七对' : '七对', fan: pureOneSuit ? 6 : 3 });
        rawFan += pureOneSuit ? 6 : 3;
    } else if (allTriplets) {
        fanTypes.push({ name: pureOneSuit ? '清对' : '对对胡', fan: pureOneSuit ? 5 : 2 });
        rawFan += pureOneSuit ? 5 : 2;
    } else if (pureOneSuit) {
        fanTypes.push({ name: '清一色', fan: 3 });
        rawFan += 3;
    } else if (isTerminalPatternHand(tiles)) {
        fanTypes.push({ name: '带幺九', fan: 2 });
        rawFan += 2;
    } else {
        fanTypes.push({ name: '平胡', fan: 1 });
        rawFan += 1;
    }

    if (isSelfDraw) {
        fanTypes.push({ name: '自摸', fan: 1 });
        rawFan += 1;
    }

    return { fanTypes, ...applyFanCap(rawFan, maxFan) };
}

export function getRoundSettlement(gameState, maxFan = 4) {
    const scoreDeltas = createEmptyScoreDeltas();
    const details = PLAYER_ORDER.reduce((result, player) => {
        result[player] = [];
        return result;
    }, {});

    (gameState.gangSettlements || []).forEach(settlement => {
        Object.entries(settlement.scoreDeltas || {}).forEach(([player, points]) => {
            scoreDeltas[player] += points;
        });
        (settlement.payments || []).forEach(payment => {
            details[payment.to].push({ name: settlement.type === 'rain' ? '下雨（暗杠）' : '刮风（明杠）', points: payment.points });
            details[payment.from].push({ name: settlement.type === 'rain' ? '下雨赔付' : '刮风赔付', points: -payment.points });
        });
    });

    (gameState.huRecords || []).forEach(record => {
        const fan = getHuFanDetails(record.tiles, record.isSelfDraw, maxFan);
        const unit = 2 ** fan.cappedFan;
        const payers = record.isSelfDraw
            ? getActiveOpponents(gameState, record.player)
            : [record.from].filter(Boolean);
        const received = unit * payers.length;

        fan.fanTypes.forEach(item => details[record.player].push({ name: item.name, fan: item.fan }));
        if (fan.isCapped) details[record.player].push({ name: `封顶 ${fan.maxFan} 番`, fan: 0 });
        details[record.player].push({ name: record.isSelfDraw ? '自摸得分' : '点炮得分', points: received });
        scoreDeltas[record.player] += received;
        payers.forEach(payer => {
            scoreDeltas[payer] -= unit;
            details[payer].push({ name: record.isSelfDraw ? '自摸赔付' : '点炮赔付', points: -unit });
        });
    });

    return { scoreDeltas, details };
}

export function dealInitialHands(wall, dealer = 'south') {
    const hands = {};
    const remainingWall = [...wall];

    PLAYER_ORDER.forEach(player => {
        const handSize = player === dealer ? 14 : 13;
        hands[player] = remainingWall.splice(0, handSize);
    });

    return {
        hands,
        wall: remainingWall
    };
}

export function drawFromWall(gameState, player) {
    if (gameState.wall.length === 0) return null;

    const tile = gameState.wall.shift();
    gameState.hands[player].push(tile);
    return tile;
}

export function discardFromHand(gameState, player, handIndex) {
    const tile = gameState.hands[player][handIndex];
    if (!tile) return null;

    gameState.hands[player].splice(handIndex, 1);
    gameState.discards[player].push(tile);
    gameState.lastDiscard = { player, tile };
    return tile;
}

export function canPeng(gameState, player) {
    const lastDiscard = gameState.lastDiscard;
    if (!lastDiscard || lastDiscard.player === player) return false;

    const matchingCount = gameState.hands[player]
        .filter(tile => isSameTileFace(tile, lastDiscard.tile))
        .length;

    return matchingCount >= 2;
}

function ensureMelds(gameState) {
    if (gameState.melds) return;

    gameState.melds = {
        south: [],
        east: [],
        north: [],
        west: []
    };
}

function createEmptyScoreDeltas() {
    return PLAYER_ORDER.reduce((scoreDeltas, player) => {
        scoreDeltas[player] = 0;
        return scoreDeltas;
    }, {});
}

function getActiveOpponents(gameState, player) {
    const winners = gameState.winners || [];
    return PLAYER_ORDER.filter(opponent => opponent !== player && !winners.includes(opponent));
}

function getGangTileFace(meld) {
    const tile = meld.tiles[0];
    return {
        suit: tile.suit,
        val: tile.val
    };
}

function createGangSettlement(gameState, player, meld) {
    const scoreDeltas = createEmptyScoreDeltas();
    let type = 'wind';
    let payers = [];
    let points = 1;

    if (meld.type === 'ming_gang') {
        payers = [meld.from];
        points = 2;
    } else if (meld.type === 'bu_gang') {
        payers = getActiveOpponents(gameState, player);
        points = 1;
    } else if (meld.type === 'an_gang') {
        type = 'rain';
        payers = getActiveOpponents(gameState, player);
        points = 2;
    }

    const payments = payers
        .filter(payer => payer && payer !== player)
        .filter(payer => !(gameState.winners || []).includes(payer))
        .map(payer => {
            scoreDeltas[payer] -= points;
            scoreDeltas[player] += points;
            return {
                from: payer,
                to: player,
                points
            };
        });

    return {
        type,
        gangType: meld.type,
        winner: player,
        tile: getGangTileFace(meld),
        payments,
        scoreDeltas
    };
}

function recordGangSettlement(gameState, player, meld) {
    if (!gameState.gangSettlements) {
        gameState.gangSettlements = [];
    }

    const settlement = createGangSettlement(gameState, player, meld);
    gameState.gangSettlements.push(settlement);
    return settlement;
}

function getTileFaceKey(tile) {
    return `${tile.suit}-${tile.val}`;
}

function findMatchingHandIndexes(hand, targetTile, maxCount) {
    const indexes = [];
    hand.forEach((tile, index) => {
        if (indexes.length < maxCount && isSameTileFace(tile, targetTile)) {
            indexes.push(index);
        }
    });
    return indexes;
}

function removeHandTilesByIndexes(hand, indexes) {
    return [...indexes]
        .sort((a, b) => b - a)
        .map(index => hand.splice(index, 1)[0])
        .reverse();
}

function createTileCounts(tiles) {
    const counts = new Map();
    tiles.forEach(tile => {
        const key = getTileFaceKey(tile);
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
}

function getCount(counts, suit, val) {
    return counts.get(`${suit}-${val}`) || 0;
}

function addCount(counts, suit, val, amount) {
    const key = `${suit}-${val}`;
    const next = getCount(counts, suit, val) + amount;
    if (next <= 0) {
        counts.delete(key);
    } else {
        counts.set(key, next);
    }
}

function findFirstRemainingFace(counts) {
    return [...counts.keys()]
        .sort((a, b) => {
            const [suitA, valA] = a.split('-');
            const [suitB, valB] = b.split('-');
            if (suitA !== suitB) return suitA.localeCompare(suitB);
            return Number(valA) - Number(valB);
        })[0];
}

function createTileFace(suit, val) {
    return { suit, val };
}

function sortTileFaces(tileFaces) {
    return [...tileFaces].sort((a, b) => {
        if (a.suit !== b.suit) return TILE_SUITS.indexOf(a.suit) - TILE_SUITS.indexOf(b.suit);
        return a.val - b.val;
    });
}

function canSplitIntoGroups(counts) {
    if (counts.size === 0) return true;

    const face = findFirstRemainingFace(counts);
    const [suit, valText] = face.split('-');
    const val = Number(valText);

    if (getCount(counts, suit, val) >= 3) {
        addCount(counts, suit, val, -3);
        if (canSplitIntoGroups(counts)) return true;
        addCount(counts, suit, val, 3);
    }

    if (val <= 7 && getCount(counts, suit, val + 1) > 0 && getCount(counts, suit, val + 2) > 0) {
        addCount(counts, suit, val, -1);
        addCount(counts, suit, val + 1, -1);
        addCount(counts, suit, val + 2, -1);
        if (canSplitIntoGroups(counts)) return true;
        addCount(counts, suit, val, 1);
        addCount(counts, suit, val + 1, 1);
        addCount(counts, suit, val + 2, 1);
    }

    return false;
}

function isTerminalTileValue(val) {
    return val === 1 || val === 9;
}

function canSplitIntoTerminalGroups(counts) {
    if (counts.size === 0) return true;

    const face = findFirstRemainingFace(counts);
    const [suit, valText] = face.split('-');
    const val = Number(valText);

    if (isTerminalTileValue(val) && getCount(counts, suit, val) >= 3) {
        addCount(counts, suit, val, -3);
        if (canSplitIntoTerminalGroups(counts)) return true;
        addCount(counts, suit, val, 3);
    }

    const canUseLeftTerminalSequence = val === 1
        && getCount(counts, suit, 2) > 0
        && getCount(counts, suit, 3) > 0;
    if (canUseLeftTerminalSequence) {
        addCount(counts, suit, 1, -1);
        addCount(counts, suit, 2, -1);
        addCount(counts, suit, 3, -1);
        if (canSplitIntoTerminalGroups(counts)) return true;
        addCount(counts, suit, 1, 1);
        addCount(counts, suit, 2, 1);
        addCount(counts, suit, 3, 1);
    }

    const canUseRightTerminalSequence = val === 7
        && getCount(counts, suit, 8) > 0
        && getCount(counts, suit, 9) > 0;
    if (canUseRightTerminalSequence) {
        addCount(counts, suit, 7, -1);
        addCount(counts, suit, 8, -1);
        addCount(counts, suit, 9, -1);
        if (canSplitIntoTerminalGroups(counts)) return true;
        addCount(counts, suit, 7, 1);
        addCount(counts, suit, 8, 1);
        addCount(counts, suit, 9, 1);
    }

    return false;
}

export function isSevenPairsHand(tiles) {
    if (!tiles || tiles.length !== 14) return false;

    const counts = createTileCounts(tiles);
    return [...counts.values()].every(count => count === 2 || count === 4);
}

export function isDragonSevenPairsHand(tiles) {
    if (!isSevenPairsHand(tiles)) return false;

    const counts = createTileCounts(tiles);
    return [...counts.values()].some(count => count === 4);
}

export function isPureOneSuitHand(tiles) {
    if (!tiles || tiles.length === 0) return false;

    const suit = tiles[0].suit;
    return tiles.every(tile => tile.suit === suit);
}

export function isAllTripletsHand(tiles) {
    if (!tiles || tiles.length % 3 !== 2) return false;

    const counts = createTileCounts(tiles);
    return [...counts.keys()].some(face => {
        const [suit, valText] = face.split('-');
        const val = Number(valText);
        if (getCount(counts, suit, val) < 2) return false;

        const trialCounts = new Map(counts);
        addCount(trialCounts, suit, val, -2);
        return [...trialCounts.values()].every(count => count % 3 === 0);
    });
}

export function isTerminalPatternHand(tiles) {
    if (!isWinningHand(tiles)) return false;

    if (isSevenPairsHand(tiles)) {
        return tiles.every(tile => isTerminalTileValue(tile.val));
    }

    const counts = createTileCounts(tiles);
    const pairFaces = [...counts.entries()]
        .filter(([, count]) => count >= 2)
        .map(([face]) => face);

    return pairFaces.some(face => {
        const [suit, valText] = face.split('-');
        const val = Number(valText);
        if (!isTerminalTileValue(val)) return false;

        const trialCounts = new Map(counts);
        addCount(trialCounts, suit, val, -2);
        return canSplitIntoTerminalGroups(trialCounts);
    });
}

export function isWinningHand(tiles) {
    if (!tiles || tiles.length % 3 !== 2) return false;

    if (isSevenPairsHand(tiles)) {
        return true;
    }

    const counts = createTileCounts(tiles);
    const pairFaces = [...counts.entries()]
        .filter(([, count]) => count >= 2)
        .map(([face]) => face);

    return pairFaces.some(face => {
        const [suit, valText] = face.split('-');
        const val = Number(valText);
        const trialCounts = new Map(counts);
        addCount(trialCounts, suit, val, -2);
        return canSplitIntoGroups(trialCounts);
    });
}

export function getTingTiles(hand, dingQueSuit = '') {
    if (!hand || hand.length % 3 !== 1) return [];

    const winningTileFaces = [];
    TILE_SUITS.forEach(suit => {
        if (suit === dingQueSuit) return;

        for (let val = 1; val <= 9; val++) {
            const candidateTile = createTileFace(suit, val);
            const candidateTiles = [...hand, candidateTile];
            if (dingQueSuit && candidateTiles.some(tile => tile.suit === dingQueSuit)) {
                continue;
            }
            if (isWinningHand(candidateTiles)) {
                winningTileFaces.push(candidateTile);
            }
        }
    });

    return sortTileFaces(winningTileFaces);
}

export function getTingDiscardOptions(hand, dingQueSuit = '') {
    if (!hand || hand.length % 3 !== 2) return [];

    return hand
        .map((discardTile, discardIndex) => {
            const remainingHand = hand.filter((_, index) => index !== discardIndex);
            const winningTiles = getTingTiles(remainingHand, dingQueSuit);
            if (winningTiles.length === 0) return null;

            return {
                discard: createTileFace(discardTile.suit, discardTile.val),
                discardIndex,
                winningTiles
            };
        })
        .filter(Boolean);
}

export function canTing(gameState, player) {
    const hand = gameState.hands[player] || [];
    const dingQueSuit = gameState.dingQue[player] || '';
    if (hand.length % 3 === 1) {
        return getTingTiles(hand, dingQueSuit).length > 0;
    }
    if (hand.length % 3 === 2) {
        return getTingDiscardOptions(hand, dingQueSuit).length > 0;
    }
    return false;
}

export function inspectDrawnRoundCalling(gameState) {
    if (gameState.wall.length !== 0) {
        return {
            reason: 'not_wall_empty',
            readyPlayers: [],
            noReadyPlayers: [],
            skippedWinners: []
        };
    }

    const readyPlayers = [];
    const noReadyPlayers = [];
    const skippedWinners = [];

    PLAYER_ORDER.forEach(player => {
        if (gameState.winners.includes(player)) {
            skippedWinners.push(player);
            return;
        }

        const hand = gameState.hands[player] || [];
        const dingQueSuit = gameState.dingQue[player] || '';
        const waitingTiles = hand.length % 3 === 1
            ? getTingTiles(hand, dingQueSuit)
            : [];
        const discardOptions = hand.length % 3 === 2
            ? getTingDiscardOptions(hand, dingQueSuit)
            : [];
        const isReady = waitingTiles.length > 0 || discardOptions.length > 0;

        if (isReady) {
            readyPlayers.push({
                player,
                handSize: hand.length,
                waitingTiles,
                discardOptions
            });
            return;
        }

        noReadyPlayers.push({
            player,
            handSize: hand.length
        });
    });

    return {
        reason: 'wall_empty',
        readyPlayers,
        noReadyPlayers,
        skippedWinners
    };
}

export function inspectDrawnRoundFlowerPigs(gameState) {
    if (gameState.wall.length !== 0) {
        return {
            reason: 'not_wall_empty',
            flowerPigPlayers: [],
            cleanPlayers: [],
            skippedWinners: []
        };
    }

    const flowerPigPlayers = [];
    const cleanPlayers = [];
    const skippedWinners = [];

    PLAYER_ORDER.forEach(player => {
        if (gameState.winners.includes(player)) {
            skippedWinners.push(player);
            return;
        }

        const dingQueSuit = gameState.dingQue[player] || '';
        if (!dingQueSuit) {
            cleanPlayers.push(player);
            return;
        }

        const remainingTiles = (gameState.hands[player] || [])
            .filter(tile => tile.suit === dingQueSuit)
            .map(tile => createTileFace(tile.suit, tile.val));

        if (remainingTiles.length > 0) {
            flowerPigPlayers.push({
                player,
                dingQueSuit,
                remainingTiles: sortTileFaces(remainingTiles)
            });
            return;
        }

        cleanPlayers.push(player);
    });

    return {
        reason: 'wall_empty',
        flowerPigPlayers,
        cleanPlayers,
        skippedWinners
    };
}

export function inspectTaxRefunds(gameState) {
    const emptyScoreDeltas = createEmptyScoreDeltas();

    if (gameState.wall.length !== 0) {
        return {
            reason: 'not_wall_empty',
            refundPlayers: [],
            skippedWinners: [],
            refunds: [],
            scoreDeltas: emptyScoreDeltas
        };
    }

    const winners = gameState.winners || [];
    const skippedWinners = PLAYER_ORDER.filter(player => winners.includes(player));
    const refundPlayers = [];
    const refunds = [];
    const totalScoreDeltas = createEmptyScoreDeltas();

    (gameState.gangSettlements || []).forEach(settlement => {
        const refundPlayer = settlement.winner;
        if (!refundPlayer || winners.includes(refundPlayer)) return;

        if (!refundPlayers.includes(refundPlayer)) {
            refundPlayers.push(refundPlayer);
        }

        const scoreDeltas = createEmptyScoreDeltas();
        const payments = (settlement.payments || []).map(payment => {
            scoreDeltas[refundPlayer] -= payment.points;
            scoreDeltas[payment.from] += payment.points;
            totalScoreDeltas[refundPlayer] -= payment.points;
            totalScoreDeltas[payment.from] += payment.points;

            return {
                from: refundPlayer,
                to: payment.from,
                points: payment.points
            };
        });

        refunds.push({
            player: refundPlayer,
            gangType: settlement.gangType,
            tile: settlement.tile,
            payments,
            scoreDeltas
        });
    });

    return {
        reason: 'wall_empty',
        refundPlayers,
        skippedWinners,
        refunds,
        scoreDeltas: totalScoreDeltas
    };
}

export function canHu(gameState, player) {
    const hand = gameState.hands[player] || [];
    const lastDiscard = gameState.lastDiscard;
    const shouldUseLastDiscard = hand.length % 3 === 1 && lastDiscard && lastDiscard.player !== player;
    const candidateTiles = shouldUseLastDiscard
        ? [...hand, lastDiscard.tile]
        : [...hand];
    const dingQueSuit = gameState.dingQue[player];

    if (dingQueSuit && candidateTiles.some(tile => tile.suit === dingQueSuit)) {
        return false;
    }

    return isWinningHand(candidateTiles);
}

export function mustHuInLastFourTiles(gameState, player) {
    return gameState.wall.length <= 4 && canHu(gameState, player);
}

export function performHu(gameState, player) {
    if (!canHu(gameState, player)) return null;

    const lastDiscard = gameState.lastDiscard;
    const shouldUseLastDiscard = gameState.hands[player].length % 3 === 1
        && lastDiscard
        && lastDiscard.player !== player;
    const winningTile = shouldUseLastDiscard
        ? lastDiscard.tile
        : gameState.hands[player][gameState.hands[player].length - 1];
    const winningTiles = shouldUseLastDiscard
        ? [...gameState.hands[player], winningTile]
        : [...gameState.hands[player]];

    if (shouldUseLastDiscard) {
        const discardPile = gameState.discards[lastDiscard.player];
        const discardIndex = discardPile.findLastIndex(tile => tile.id === lastDiscard.tile.id);
        if (discardIndex !== -1) {
            discardPile.splice(discardIndex, 1);
        }
    }

    if (!gameState.winners.includes(player)) {
        gameState.winners.push(player);
    }

    if (!gameState.huRecords) gameState.huRecords = [];
    gameState.huRecords.push({
        player,
        from: shouldUseLastDiscard ? lastDiscard.player : null,
        isSelfDraw: !shouldUseLastDiscard,
        tile: winningTile,
        tiles: winningTiles
    });

    gameState.lastDiscard = null;

    const roundStatus = isRoundOver(gameState);
    if (roundStatus.over) {
        gameState.phase = 'round_over';
        gameState.endReason = roundStatus.reason;
    }

    return {
        player,
        tile: winningTile
    };
}

export function getAvailableGang(gameState, player) {
    const hand = gameState.hands[player] || [];
    const lastDiscard = gameState.lastDiscard;

    if (lastDiscard && lastDiscard.player !== player) {
        const matchingIndexes = findMatchingHandIndexes(hand, lastDiscard.tile, 3);
        if (matchingIndexes.length >= 3) {
            return {
                type: 'ming_gang',
                from: lastDiscard.player,
                tile: lastDiscard.tile,
                handIndexes: matchingIndexes
            };
        }
    }

    ensureMelds(gameState);
    const pengMeldIndex = gameState.melds[player].findIndex(meld => {
        if (meld.type !== 'peng') return false;
        return hand.some(tile => isSameTileFace(tile, meld.tiles[0]));
    });
    if (pengMeldIndex !== -1) {
        const pengMeld = gameState.melds[player][pengMeldIndex];
        const handIndex = hand.findIndex(tile => isSameTileFace(tile, pengMeld.tiles[0]));
        return {
            type: 'bu_gang',
            from: pengMeld.from,
            tile: pengMeld.tiles[0],
            meldIndex: pengMeldIndex,
            handIndexes: [handIndex]
        };
    }

    const faceCounts = new Map();
    hand.forEach(tile => {
        const key = getTileFaceKey(tile);
        faceCounts.set(key, (faceCounts.get(key) || 0) + 1);
    });

    const gangFace = [...faceCounts.entries()].find(([, count]) => count >= 4);
    if (gangFace) {
        const [suit, valText] = gangFace[0].split('-');
        const targetTile = { suit, val: Number(valText) };
        return {
            type: 'an_gang',
            from: player,
            tile: targetTile,
            handIndexes: findMatchingHandIndexes(hand, targetTile, 4)
        };
    }

    return null;
}

export function canGang(gameState, player) {
    return Boolean(getAvailableGang(gameState, player));
}

export function chooseAutoReaction(gameState, players = PLAYER_ORDER) {
    if (!gameState.lastDiscard) return null;

    const priority = {
        hu: 3,
        gang: 2,
        peng: 1
    };

    // 同一种操作同时出现时，必须从出牌者的下一家开始依次裁决。
    // 例如东家出牌，优先顺序是北家、西家、南家，而不是固定的南东南西。
    const discarder = gameState.lastDiscard.player;
    const firstResponderIndex = PLAYER_ORDER.indexOf(discarder);
    const responseOrder = PLAYER_ORDER
        .map((_, index) => PLAYER_ORDER[(firstResponderIndex + index + 1) % PLAYER_ORDER.length])
        .filter(player => players.includes(player));

    const reactions = responseOrder
        .filter(player => player !== discarder)
        .filter(player => !gameState.winners.includes(player))
        .map(player => {
            if (canHu(gameState, player)) {
                return { player, action: 'hu' };
            }

            const gang = getAvailableGang(gameState, player);
            if (gang?.type === 'ming_gang') {
                return { player, action: 'gang' };
            }

            if (canPeng(gameState, player)) {
                return { player, action: 'peng' };
            }

            return null;
        })
        .filter(Boolean);

    reactions.sort((a, b) => priority[b.action] - priority[a.action]);

    return reactions[0] || null;
}

export function performAutoReaction(gameState, players = PLAYER_ORDER) {
    const reaction = chooseAutoReaction(gameState, players);
    if (!reaction) return null;

    let result = null;
    if (reaction.action === 'hu') {
        result = performHu(gameState, reaction.player);
    } else if (reaction.action === 'gang') {
        result = performGang(gameState, reaction.player);
    } else if (reaction.action === 'peng') {
        result = performPeng(gameState, reaction.player);
    }

    return {
        ...reaction,
        result
    };
}

function drawSupplementTile(gameState, player) {
    const tile = drawFromWall(gameState, player);
    if (!tile) {
        gameState.phase = 'round_over';
        gameState.endReason = 'wall_empty';
    }
    return tile;
}

export function performGang(gameState, player) {
    const gang = getAvailableGang(gameState, player);
    if (!gang) return null;

    ensureMelds(gameState);

    if (gang.type === 'ming_gang') {
        const takenTiles = removeHandTilesByIndexes(gameState.hands[player], gang.handIndexes);
        const discardPile = gameState.discards[gang.from];
        const discardIndex = discardPile.findLastIndex(tile => tile.id === gameState.lastDiscard.tile.id);
        if (discardIndex !== -1) {
            discardPile.splice(discardIndex, 1);
        }

        const meld = {
            type: 'ming_gang',
            from: gang.from,
            tiles: [gameState.lastDiscard.tile, ...takenTiles]
        };
        gameState.melds[player].push(meld);
        recordGangSettlement(gameState, player, meld);
        gameState.currentPlayer = player;
        gameState.phase = 'playing';
        gameState.lastDiscard = null;
        drawSupplementTile(gameState, player);
        return meld;
    }

    if (gang.type === 'bu_gang') {
        const [addedTile] = removeHandTilesByIndexes(gameState.hands[player], gang.handIndexes);
        const meld = gameState.melds[player][gang.meldIndex];
        meld.type = 'bu_gang';
        meld.tiles.push(addedTile);
        recordGangSettlement(gameState, player, meld);
        gameState.currentPlayer = player;
        gameState.phase = 'playing';
        gameState.lastDiscard = null;
        drawSupplementTile(gameState, player);
        return meld;
    }

    const takenTiles = removeHandTilesByIndexes(gameState.hands[player], gang.handIndexes);
    const meld = {
        type: 'an_gang',
        from: player,
        tiles: takenTiles
    };
    gameState.melds[player].push(meld);
    recordGangSettlement(gameState, player, meld);
    gameState.currentPlayer = player;
    gameState.phase = 'playing';
    gameState.lastDiscard = null;
    drawSupplementTile(gameState, player);
    return meld;
}

export function performPeng(gameState, player) {
    if (!canPeng(gameState, player)) return null;

    const { player: fromPlayer, tile: discardTile } = gameState.lastDiscard;
    const matchingIndexes = [];

    gameState.hands[player].forEach((tile, index) => {
        if (matchingIndexes.length < 2 && isSameTileFace(tile, discardTile)) {
            matchingIndexes.push(index);
        }
    });

    const takenTiles = matchingIndexes
        .sort((a, b) => b - a)
        .map(index => gameState.hands[player].splice(index, 1)[0]);

    const discardPile = gameState.discards[fromPlayer];
    const discardIndex = discardPile.findLastIndex(tile => tile.id === discardTile.id);
    if (discardIndex !== -1) {
        discardPile.splice(discardIndex, 1);
    }

    ensureMelds(gameState);

    const meld = {
        type: 'peng',
        from: fromPlayer,
        tiles: [discardTile, ...takenTiles]
    };

    gameState.melds[player].push(meld);
    gameState.currentPlayer = player;
    gameState.phase = 'playing';
    gameState.lastDiscard = null;

    return meld;
}

export function getNextPlayer(player) {
    const currentIndex = PLAYER_ORDER.indexOf(player);
    if (currentIndex === -1) return PLAYER_ORDER[0];

    return PLAYER_ORDER[(currentIndex + 1) % PLAYER_ORDER.length];
}

export function chooseAutoDiscardIndex(gameState, player) {
    const hand = gameState.hands[player] || [];
    if (hand.length === 0) return -1;

    const dingQueSuit = gameState.dingQue[player];
    if (dingQueSuit) {
        const queIndex = hand.findIndex(tile => tile.suit === dingQueSuit);
        if (queIndex !== -1) return queIndex;
    }

    return 0;
}

function getSameSuitValues(hand, tile, tileIndex) {
    return hand
        .filter((candidate, index) => index !== tileIndex && candidate.suit === tile.suit)
        .map(candidate => candidate.val);
}

function getIntermediateTileKeepScore(hand, tile, tileIndex) {
    const sameSuitValues = getSameSuitValues(hand, tile, tileIndex);
    const sameFaceCount = sameSuitValues.filter(val => val === tile.val).length;
    let score = 0;

    if (sameFaceCount > 0) {
        score += sameFaceCount >= 2 ? 80 : 60;
    }

    const hasLeftSequence = sameSuitValues.includes(tile.val - 2) && sameSuitValues.includes(tile.val - 1);
    const hasMiddleSequence = sameSuitValues.includes(tile.val - 1) && sameSuitValues.includes(tile.val + 1);
    const hasRightSequence = sameSuitValues.includes(tile.val + 1) && sameSuitValues.includes(tile.val + 2);
    if (hasLeftSequence || hasMiddleSequence || hasRightSequence) {
        score += 45;
    }

    if (sameSuitValues.includes(tile.val - 1) || sameSuitValues.includes(tile.val + 1)) {
        score += 25;
    }

    if (sameSuitValues.includes(tile.val - 2) || sameSuitValues.includes(tile.val + 2)) {
        score += 12;
    }

    return score;
}

export function chooseIntermediateAutoDiscardIndex(gameState, player) {
    const hand = gameState.hands[player] || [];
    if (hand.length === 0) return -1;

    const dingQueSuit = gameState.dingQue[player];
    if (dingQueSuit) {
        const queIndexes = hand
            .map((tile, index) => ({ tile, index }))
            .filter(item => item.tile.suit === dingQueSuit);

        if (queIndexes.length > 0) {
            queIndexes.sort((a, b) => {
                const scoreDiff = getIntermediateTileKeepScore(hand, a.tile, a.index)
                    - getIntermediateTileKeepScore(hand, b.tile, b.index);
                return scoreDiff || a.index - b.index;
            });
            return queIndexes[0].index;
        }
    }

    const candidates = hand.map((tile, index) => ({
        index,
        score: getIntermediateTileKeepScore(hand, tile, index)
    }));

    candidates.sort((a, b) => a.score - b.score || a.index - b.index);
    return candidates[0].index;
}

function getDiscardRiskScore(gameState, player, tile) {
    return PLAYER_ORDER
        .filter(opponent => opponent !== player)
        .flatMap(opponent => gameState.discards?.[opponent] || [])
        .filter(discardedTile => discardedTile.suit === tile.suit)
        .reduce((score, discardedTile) => {
            if (discardedTile.val === tile.val) return score + 12;
            if (Math.abs(discardedTile.val - tile.val) === 1) return score + 5;
            if (Math.abs(discardedTile.val - tile.val) === 2) return score + 2;
            return score;
        }, 0);
}

function createsReadyHandAfterDiscard(gameState, player, discardIndex) {
    const hand = gameState.hands[player] || [];
    const remainingHand = hand.filter((_, index) => index !== discardIndex);
    const dingQueSuit = gameState.dingQue[player] || '';
    return getTingTiles(remainingHand, dingQueSuit).length > 0;
}

export function chooseAdvancedAutoDiscardIndex(gameState, player) {
    const hand = gameState.hands[player] || [];
    if (hand.length === 0) return -1;

    const dingQueSuit = gameState.dingQue[player];
    if (dingQueSuit) {
        const queIndex = chooseIntermediateAutoDiscardIndex(gameState, player);
        if (queIndex !== -1 && hand[queIndex]?.suit === dingQueSuit) {
            return queIndex;
        }
    }

    const candidates = hand.map((tile, index) => {
        const readyScore = createsReadyHandAfterDiscard(gameState, player, index) ? 1000 : 0;
        const shapePenalty = getIntermediateTileKeepScore(hand, tile, index);
        const riskPenalty = getDiscardRiskScore(gameState, player, tile);

        return {
            index,
            score: readyScore - shapePenalty - riskPenalty
        };
    });

    candidates.sort((a, b) => b.score - a.score || a.index - b.index);
    return candidates[0].index;
}

export function autoDiscardForPlayer(gameState, player, level = 'basic') {
    let handIndex = chooseAutoDiscardIndex(gameState, player);
    if (level === 'intermediate') {
        handIndex = chooseIntermediateAutoDiscardIndex(gameState, player);
    } else if (level === 'advanced') {
        handIndex = chooseAdvancedAutoDiscardIndex(gameState, player);
    }
    if (handIndex === -1) return null;

    return discardFromHand(gameState, player, handIndex);
}

export function isRoundOver(gameState) {
    if (gameState.wall.length === 0) {
        return {
            over: true,
            reason: 'wall_empty'
        };
    }

    if (gameState.winners.length >= PLAYER_ORDER.length - 1) {
        return {
            over: true,
            reason: 'last_player_left'
        };
    }

    return {
        over: false,
        reason: ''
    };
}

export function advanceToNextPlayer(gameState) {
    const roundStatus = isRoundOver(gameState);
    if (roundStatus.over) {
        gameState.phase = 'round_over';
        gameState.endReason = roundStatus.reason;
        return {
            player: gameState.currentPlayer,
            drawn: null,
            roundOver: true,
            reason: roundStatus.reason
        };
    }

    let nextPlayer = getNextPlayer(gameState.currentPlayer);
    while (gameState.winners.includes(nextPlayer)) {
        nextPlayer = getNextPlayer(nextPlayer);
    }

    // 弃牌只能在刚打出后的“响应窗口”里被碰、杠或胡。
    // 一旦无人响应并开始下一家的摸牌，旧弃牌就不能再被领取。
    gameState.lastDiscard = null;
    gameState.currentPlayer = nextPlayer;

    const needsDraw = gameState.hands[nextPlayer].length <= 13;
    const drawn = needsDraw ? drawFromWall(gameState, nextPlayer) : null;

    if (!drawn && needsDraw) {
        gameState.phase = 'round_over';
        gameState.endReason = 'wall_empty';
    }

    return {
        player: nextPlayer,
        drawn,
        roundOver: !drawn && needsDraw,
        reason: !drawn && needsDraw ? 'wall_empty' : ''
    };
}

export function createLocalRound() {
    const wall = shuffleTiles(createMahjongWall());
    const dealt = dealInitialHands(wall, 'south');

    return {
        phase: 'ding_que',
        dealer: 'south',
        currentPlayer: 'south',
        wall: dealt.wall,
        hands: dealt.hands,
        discards: {
            south: [],
            east: [],
            north: [],
            west: []
        },
        melds: {
            south: [],
            east: [],
            north: [],
            west: []
        },
        dingQue: {
            south: '',
            east: '',
            north: '',
            west: ''
        },
        lastDiscard: null,
        endReason: '',
        winners: [],
        gangSettlements: [],
        huRecords: []
    };
}

export function getQueName(suit) {
    if (suit === 'wan') return '万';
    if (suit === 'tiao') return '条';
    if (suit === 'tong') return '筒';
    return '';
}

