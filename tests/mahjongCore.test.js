import test from 'node:test';
import assert from 'node:assert/strict';
import * as mahjongCore from '../src/mahjongCore.js';


import {
    createTile,
    createLocalRound,
    chooseAutoDingQueSuit,
    getNextPlayer,
    isRoundOver,
    isWinningHand,
    canPeng,
    canGang,
    canHu,
    mustHuInLastFourTiles,
    chooseAutoReaction,
    performPeng,
    performGang,
    performHu,
    performAutoReaction,
    autoDiscardForPlayer,
    advanceToNextPlayer,
    inspectTaxRefunds,
    applyFanCap,
    chooseIntermediateAutoDiscardIndex,
    chooseAdvancedAutoDiscardIndex,
    getDingQueDisplayViews,
    getDiscardPileViews,
    getOpponentHandBackViews,
    getPlayerHandView
    ,getRoundSettlement
} from '../src/mahjongCore.js';

test('getNextPlayer follows south east north west order', () => {
    assert.equal(getNextPlayer('south'), 'east');
    assert.equal(getNextPlayer('east'), 'north');
    assert.equal(getNextPlayer('north'), 'west');
    assert.equal(getNextPlayer('west'), 'south');
});

test('autoDiscardForPlayer discards one tile and records it in that player discard pile', () => {
    const gameState = createLocalRound();
    const beforeHandCount = gameState.hands.east.length;
    const beforeDiscardCount = gameState.discards.east.length;

    const discarded = autoDiscardForPlayer(gameState, 'east');

    assert.ok(discarded);
    assert.equal(gameState.hands.east.length, beforeHandCount - 1);
    assert.equal(gameState.discards.east.length, beforeDiscardCount + 1);
    assert.equal(gameState.lastDiscard.player, 'east');
    assert.equal(gameState.lastDiscard.tile.id, discarded.id);
});

test('chooseAutoDingQueSuit chooses the suit with the fewest tiles in hand', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('tiao', 1, 1),
        createTile('tiao', 2, 1),
        createTile('tong', 9, 1)
    ];

    assert.equal(chooseAutoDingQueSuit(hand), 'tong');
});

test('autoDiscardForPlayer prioritizes the player ding que suit', () => {
    const gameState = createLocalRound();
    gameState.hands.east = [
        createTile('wan', 1, 1),
        createTile('tiao', 2, 1),
        createTile('tong', 3, 1)
    ];
    gameState.dingQue.east = 'tiao';

    const discarded = autoDiscardForPlayer(gameState, 'east');

    assert.equal(discarded.suit, 'tiao');
    assert.deepEqual(gameState.hands.east.map(tile => tile.suit), ['wan', 'tong']);
});

test('getPlayerHandView uses the real player hand and marks ding que restrictions', () => {
    const gameState = createLocalRound();
    gameState.dingQue.south = 'tong';
    gameState.hands.south = [
        createTile('wan', 2, 1),
        createTile('tong', 9, 1),
        createTile('tiao', 1, 1),
        createTile('tong', 3, 1)
    ];

    const view = getPlayerHandView(gameState, 'south');

    assert.deepEqual(view.map(item => ({
        id: item.tile.id,
        disabled: item.disabled,
        recommended: item.recommended
    })), [
        { id: 'tiao-1-1', disabled: true, recommended: false },
        { id: 'wan-2-1', disabled: true, recommended: false },
        { id: 'tong-3-1', disabled: false, recommended: true },
        { id: 'tong-9-1', disabled: false, recommended: true }
    ]);
});

test('getOpponentHandBackViews reports real opponent hand counts and orientation', () => {
    const gameState = createLocalRound();
    gameState.hands.east = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1)
    ];
    gameState.hands.north = [
        createTile('tiao', 1, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 3, 1)
    ];
    gameState.hands.west = [
        createTile('tong', 1, 1),
        createTile('tong', 2, 1),
        createTile('tong', 3, 1),
        createTile('tong', 4, 1)
    ];

    const views = getOpponentHandBackViews(gameState);

    assert.deepEqual(views.map(view => ({
        player: view.player,
        count: view.tiles.length,
        isVertical: view.isVertical
    })), [
        { player: 'east', count: 5, isVertical: true },
        { player: 'north', count: 3, isVertical: false },
        { player: 'west', count: 4, isVertical: true }
    ]);
});

test('getDiscardPileViews reports real discard records for every player', () => {
    const gameState = createLocalRound();
    gameState.discards.south = [
        createTile('wan', 1, 1),
        createTile('tiao', 9, 1)
    ];
    gameState.discards.east = [
        createTile('tong', 3, 1)
    ];
    gameState.discards.north = [];
    gameState.discards.west = [
        createTile('wan', 7, 1),
        createTile('wan', 8, 1),
        createTile('wan', 9, 1)
    ];

    const views = getDiscardPileViews(gameState);

    assert.deepEqual(views.map(view => ({
        player: view.player,
        tileIds: view.tiles.map(tile => tile.id)
    })), [
        { player: 'south', tileIds: ['wan-1-1', 'tiao-9-1'] },
        { player: 'east', tileIds: ['tong-3-1'] },
        { player: 'north', tileIds: [] },
        { player: 'west', tileIds: ['wan-7-1', 'wan-8-1', 'wan-9-1'] }
    ]);
});

test('getDingQueDisplayViews reports real ding que status for every player', () => {
    const gameState = createLocalRound();
    gameState.dingQue = {
        south: 'wan',
        east: 'tiao',
        north: 'tong',
        west: ''
    };

    const views = getDingQueDisplayViews(gameState);

    assert.deepEqual(views.map(view => ({
        player: view.player,
        suit: view.suit,
        statusText: view.statusText,
        badgeText: view.badgeText,
        hasChosen: view.hasChosen
    })), [
        { player: 'south', suit: 'wan', statusText: '定缺：万', badgeText: '定缺：万', hasChosen: true },
        { player: 'east', suit: 'tiao', statusText: '定缺：条', badgeText: '定缺：条', hasChosen: true },
        { player: 'north', suit: 'tong', statusText: '定缺：筒', badgeText: '定缺：筒', hasChosen: true },
        { player: 'west', suit: '', statusText: '定缺：未选', badgeText: '定缺', hasChosen: false }
    ]);
});

test('chooseIntermediateAutoDiscardIndex keeps pairs, sequences, and connected tiles first', () => {
    const gameState = createLocalRound();
    gameState.dingQue.east = '';
    gameState.hands.east = [
        createTile('wan', 5, 1),
        createTile('wan', 5, 2),
        createTile('tiao', 2, 1),
        createTile('tiao', 3, 1),
        createTile('tiao', 4, 1),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('wan', 9, 1)
    ];

    const discardIndex = chooseIntermediateAutoDiscardIndex(gameState, 'east');

    assert.equal(discardIndex, 7);
    assert.equal(gameState.hands.east[discardIndex].id, 'wan-9-1');
});

test('chooseIntermediateAutoDiscardIndex still prioritizes ding que suit before hand shape', () => {
    const gameState = createLocalRound();
    gameState.dingQue.east = 'tong';
    gameState.hands.east = [
        createTile('wan', 9, 1),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('wan', 5, 1),
        createTile('wan', 5, 2)
    ];

    const discardIndex = chooseIntermediateAutoDiscardIndex(gameState, 'east');

    assert.equal(discardIndex, 1);
    assert.equal(gameState.hands.east[discardIndex].suit, 'tong');
});

test('autoDiscardForPlayer can use intermediate discard strategy', () => {
    const gameState = createLocalRound();
    gameState.dingQue.east = '';
    gameState.hands.east = [
        createTile('wan', 5, 1),
        createTile('wan', 5, 2),
        createTile('tiao', 2, 1),
        createTile('tiao', 3, 1),
        createTile('tiao', 4, 1),
        createTile('wan', 9, 1)
    ];

    const discarded = autoDiscardForPlayer(gameState, 'east', 'intermediate');

    assert.equal(discarded.id, 'wan-9-1');
    assert.deepEqual(gameState.hands.east.map(tile => tile.id), [
        'wan-5-1',
        'wan-5-2',
        'tiao-2-1',
        'tiao-3-1',
        'tiao-4-1'
    ]);
});

test('chooseAdvancedAutoDiscardIndex prioritizes a discard that makes the hand ready', () => {
    const gameState = createLocalRound();
    gameState.dingQue.east = '';
    gameState.hands.east = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1),
        createTile('tiao', 5, 1)
    ];

    const discardIndex = chooseAdvancedAutoDiscardIndex(gameState, 'east');

    assert.equal(discardIndex, 12);
    assert.equal(gameState.hands.east[discardIndex].id, 'wan-9-1');
});

test('chooseAdvancedAutoDiscardIndex chooses the safer discard when ready options tie', () => {
    const gameState = createLocalRound();
    gameState.dingQue.east = '';
    gameState.discards.south = [
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('wan', 7, 1)
    ];
    gameState.discards.north = [
        createTile('wan', 9, 1)
    ];
    gameState.hands.east = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 2),
        createTile('tiao', 5, 1)
    ];

    const discardIndex = chooseAdvancedAutoDiscardIndex(gameState, 'east');

    assert.equal(discardIndex, 13);
    assert.equal(gameState.hands.east[discardIndex].id, 'tiao-5-1');
});

test('canPeng returns true when player has two matching tiles for last discard', () => {
    const gameState = createLocalRound();
    const targetTile = createTile('tong', 5, 1);
    gameState.lastDiscard = {
        player: 'east',
        tile: targetTile
    };
    gameState.hands.south = [
        createTile('tong', 5, 2),
        createTile('tong', 5, 3),
        createTile('wan', 1, 1)
    ];

    assert.equal(canPeng(gameState, 'south'), true);
});

test('canPeng returns false when player has fewer than two matching tiles', () => {
    const gameState = createLocalRound();
    gameState.lastDiscard = {
        player: 'east',
        tile: createTile('tong', 5, 1)
    };
    gameState.hands.south = [
        createTile('tong', 5, 2),
        createTile('wan', 1, 1)
    ];

    assert.equal(canPeng(gameState, 'south'), false);
});

test('canPeng returns false for the player who made the discard', () => {
    const gameState = createLocalRound();
    gameState.lastDiscard = {
        player: 'south',
        tile: createTile('tong', 5, 1)
    };
    gameState.hands.south = [
        createTile('tong', 5, 2),
        createTile('tong', 5, 3)
    ];

    assert.equal(canPeng(gameState, 'south'), false);
});

test('performPeng takes two matching hand tiles, removes the discard, and gives turn to player', () => {
    const gameState = createLocalRound();
    const discardedTile = createTile('tong', 5, 1);
    gameState.currentPlayer = 'east';
    gameState.lastDiscard = {
        player: 'east',
        tile: discardedTile
    };
    gameState.discards.east = [
        createTile('wan', 1, 1),
        discardedTile
    ];
    gameState.hands.south = [
        createTile('tong', 5, 2),
        createTile('tong', 5, 3),
        createTile('wan', 2, 1),
        createTile('tiao', 9, 1)
    ];

    const meld = performPeng(gameState, 'south');

    assert.equal(meld.type, 'peng');
    assert.equal(meld.from, 'east');
    assert.equal(meld.tiles.length, 3);
    assert.deepEqual(meld.tiles.map(tile => `${tile.suit}-${tile.val}`), [
        'tong-5',
        'tong-5',
        'tong-5'
    ]);
    assert.deepEqual(gameState.hands.south.map(tile => tile.id), [
        'wan-2-1',
        'tiao-9-1'
    ]);
    assert.deepEqual(gameState.discards.east.map(tile => tile.id), [
        'wan-1-1'
    ]);
    assert.equal(gameState.melds.south.length, 1);
    assert.equal(gameState.currentPlayer, 'south');
    assert.equal(gameState.lastDiscard, null);
});

test('canGang returns true when player has four matching tiles in hand', () => {
    const gameState = createLocalRound();
    gameState.hands.south = [
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('wan', 8, 3),
        createTile('wan', 8, 4),
        createTile('tong', 1, 1)
    ];

    assert.equal(canGang(gameState, 'south'), true);
});

test('canGang returns true when player can gang the last discard with three matching tiles', () => {
    const gameState = createLocalRound();
    gameState.lastDiscard = {
        player: 'east',
        tile: createTile('tiao', 6, 1)
    };
    gameState.hands.south = [
        createTile('tiao', 6, 2),
        createTile('tiao', 6, 3),
        createTile('tiao', 6, 4),
        createTile('tong', 1, 1)
    ];

    assert.equal(canGang(gameState, 'south'), true);
});

test('canGang returns true when player can add a tile to an existing peng meld', () => {
    const gameState = createLocalRound();
    gameState.melds.south = [{
        type: 'peng',
        from: 'east',
        tiles: [
            createTile('tong', 3, 1),
            createTile('tong', 3, 2),
            createTile('tong', 3, 3)
        ]
    }];
    gameState.hands.south = [
        createTile('tong', 3, 4),
        createTile('wan', 1, 1)
    ];

    assert.equal(canGang(gameState, 'south'), true);
});

test('performGang handles concealed gang by removing four tiles, adding a meld, and drawing a supplement tile', () => {
    const gameState = createLocalRound();
    gameState.currentPlayer = 'south';
    gameState.wall = [createTile('tong', 9, 1)];
    gameState.hands.south = [
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('wan', 8, 3),
        createTile('wan', 8, 4),
        createTile('tong', 1, 1)
    ];

    const meld = performGang(gameState, 'south');

    assert.equal(meld.type, 'an_gang');
    assert.equal(meld.tiles.length, 4);
    assert.deepEqual(gameState.hands.south.map(tile => tile.id), [
        'tong-1-1',
        'tong-9-1'
    ]);
    assert.equal(gameState.melds.south.length, 1);
    assert.equal(gameState.wall.length, 0);
    assert.equal(gameState.currentPlayer, 'south');
});

test('performGang handles exposed gang from last discard and removes that discard from the discard pile', () => {
    const gameState = createLocalRound();
    const discardedTile = createTile('tiao', 6, 1);
    gameState.currentPlayer = 'east';
    gameState.wall = [createTile('wan', 9, 1)];
    gameState.lastDiscard = {
        player: 'east',
        tile: discardedTile
    };
    gameState.discards.east = [
        createTile('tong', 2, 1),
        discardedTile
    ];
    gameState.hands.south = [
        createTile('tiao', 6, 2),
        createTile('tiao', 6, 3),
        createTile('tiao', 6, 4),
        createTile('tong', 1, 1)
    ];

    const meld = performGang(gameState, 'south');

    assert.equal(meld.type, 'ming_gang');
    assert.equal(meld.from, 'east');
    assert.equal(meld.tiles.length, 4);
    assert.deepEqual(gameState.discards.east.map(tile => tile.id), [
        'tong-2-1'
    ]);
    assert.deepEqual(gameState.hands.south.map(tile => tile.id), [
        'tong-1-1',
        'wan-9-1'
    ]);
    assert.equal(gameState.currentPlayer, 'south');
    assert.equal(gameState.lastDiscard, null);
});

test('performGang handles added gang by upgrading an existing peng meld', () => {
    const gameState = createLocalRound();
    gameState.currentPlayer = 'south';
    gameState.wall = [createTile('wan', 9, 1)];
    gameState.melds.south = [{
        type: 'peng',
        from: 'east',
        tiles: [
            createTile('tong', 3, 1),
            createTile('tong', 3, 2),
            createTile('tong', 3, 3)
        ]
    }];
    gameState.hands.south = [
        createTile('tong', 3, 4),
        createTile('wan', 1, 1)
    ];

    const meld = performGang(gameState, 'south');

    assert.equal(meld.type, 'bu_gang');
    assert.equal(meld.tiles.length, 4);
    assert.equal(gameState.melds.south.length, 1);
    assert.deepEqual(gameState.hands.south.map(tile => tile.id), [
        'wan-1-1',
        'wan-9-1'
    ]);
});

test('performGang records wind settlement for exposed gang from discard payer', () => {
    const gameState = createLocalRound();
    const discardedTile = createTile('tiao', 6, 1);
    gameState.currentPlayer = 'east';
    gameState.wall = [createTile('wan', 9, 1)];
    gameState.lastDiscard = {
        player: 'east',
        tile: discardedTile
    };
    gameState.discards.east = [discardedTile];
    gameState.hands.south = [
        createTile('tiao', 6, 2),
        createTile('tiao', 6, 3),
        createTile('tiao', 6, 4),
        createTile('tong', 1, 1)
    ];

    performGang(gameState, 'south');

    assert.deepEqual(gameState.gangSettlements, [{
        type: 'wind',
        gangType: 'ming_gang',
        winner: 'south',
        tile: { suit: 'tiao', val: 6 },
        payments: [{ from: 'east', to: 'south', points: 2 }],
        scoreDeltas: { south: 2, east: -2, north: 0, west: 0 }
    }]);
});

test('performGang records wind settlement for added gang paid by active opponents', () => {
    const gameState = createLocalRound();
    gameState.currentPlayer = 'south';
    gameState.wall = [createTile('wan', 9, 1)];
    gameState.winners = ['north'];
    gameState.melds.south = [{
        type: 'peng',
        from: 'east',
        tiles: [
            createTile('tong', 3, 1),
            createTile('tong', 3, 2),
            createTile('tong', 3, 3)
        ]
    }];
    gameState.hands.south = [
        createTile('tong', 3, 4),
        createTile('wan', 1, 1)
    ];

    performGang(gameState, 'south');

    assert.deepEqual(gameState.gangSettlements, [{
        type: 'wind',
        gangType: 'bu_gang',
        winner: 'south',
        tile: { suit: 'tong', val: 3 },
        payments: [
            { from: 'east', to: 'south', points: 1 },
            { from: 'west', to: 'south', points: 1 }
        ],
        scoreDeltas: { south: 2, east: -1, north: 0, west: -1 }
    }]);
});

test('performGang records rain settlement for concealed gang paid by active opponents', () => {
    const gameState = createLocalRound();
    gameState.currentPlayer = 'south';
    gameState.wall = [createTile('tong', 9, 1)];
    gameState.winners = ['east'];
    gameState.hands.south = [
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('wan', 8, 3),
        createTile('wan', 8, 4),
        createTile('tong', 1, 1)
    ];

    performGang(gameState, 'south');

    assert.deepEqual(gameState.gangSettlements, [{
        type: 'rain',
        gangType: 'an_gang',
        winner: 'south',
        tile: { suit: 'wan', val: 8 },
        payments: [
            { from: 'north', to: 'south', points: 2 },
            { from: 'west', to: 'south', points: 2 }
        ],
        scoreDeltas: { south: 4, east: 0, north: -2, west: -2 }
    }]);
});

test('inspectTaxRefunds returns gang points when the gang player did not win', () => {
    const gameState = createLocalRound();
    gameState.wall = [];
    gameState.winners = ['east'];
    gameState.gangSettlements = [{
        type: 'wind',
        gangType: 'ming_gang',
        winner: 'south',
        tile: { suit: 'tiao', val: 6 },
        payments: [{ from: 'east', to: 'south', points: 2 }],
        scoreDeltas: { south: 2, east: -2, north: 0, west: 0 }
    }, {
        type: 'rain',
        gangType: 'an_gang',
        winner: 'east',
        tile: { suit: 'wan', val: 8 },
        payments: [
            { from: 'north', to: 'east', points: 2 },
            { from: 'west', to: 'east', points: 2 }
        ],
        scoreDeltas: { south: 0, east: 4, north: -2, west: -2 }
    }];

    const result = inspectTaxRefunds(gameState);

    assert.deepEqual(result, {
        reason: 'wall_empty',
        refundPlayers: ['south'],
        skippedWinners: ['east'],
        refunds: [{
            player: 'south',
            gangType: 'ming_gang',
            tile: { suit: 'tiao', val: 6 },
            payments: [{ from: 'south', to: 'east', points: 2 }],
            scoreDeltas: { south: -2, east: 2, north: 0, west: 0 }
        }],
        scoreDeltas: { south: -2, east: 2, north: 0, west: 0 }
    });
});

test('inspectTaxRefunds does nothing before the wall is empty', () => {
    const gameState = createLocalRound();
    gameState.wall = [createTile('wan', 1, 1)];
    gameState.gangSettlements = [{
        type: 'wind',
        gangType: 'ming_gang',
        winner: 'south',
        tile: { suit: 'tiao', val: 6 },
        payments: [{ from: 'east', to: 'south', points: 2 }],
        scoreDeltas: { south: 2, east: -2, north: 0, west: 0 }
    }];

    assert.deepEqual(inspectTaxRefunds(gameState), {
        reason: 'not_wall_empty',
        refundPlayers: [],
        skippedWinners: [],
        refunds: [],
        scoreDeltas: { south: 0, east: 0, north: 0, west: 0 }
    });
});

test('applyFanCap keeps fan count unchanged when it is below the default cap', () => {
    assert.deepEqual(applyFanCap(3), {
        rawFan: 3,
        cappedFan: 3,
        maxFan: 4,
        isCapped: false
    });
});

test('applyFanCap marks fan count as capped only when it exceeds the cap', () => {
    assert.deepEqual(applyFanCap(4), {
        rawFan: 4,
        cappedFan: 4,
        maxFan: 4,
        isCapped: false
    });

    assert.deepEqual(applyFanCap(7), {
        rawFan: 7,
        cappedFan: 4,
        maxFan: 4,
        isCapped: true
    });
});

test('applyFanCap supports a custom room cap', () => {
    assert.deepEqual(applyFanCap(6, 5), {
        rawFan: 6,
        cappedFan: 5,
        maxFan: 5,
        isCapped: true
    });
});

test('isWinningHand returns true for four groups and one pair', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1),
        createTile('wan', 9, 2)
    ];

    assert.equal(isWinningHand(hand), true);
});

test('isWinningHand returns true for seven pairs', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 3, 1),
        createTile('wan', 3, 2),
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 6, 1),
        createTile('tiao', 6, 2),
        createTile('tong', 4, 1),
        createTile('tong', 4, 2),
        createTile('tong', 9, 1),
        createTile('tong', 9, 2)
    ];

    assert.equal(isWinningHand(hand), true);
});

test('canHu returns true when the last discard completes seven pairs', () => {
    const gameState = createLocalRound();
    gameState.dingQue.south = 'tong';
    gameState.lastDiscard = {
        player: 'east',
        tile: createTile('wan', 9, 2)
    };
    gameState.hands.south = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 3, 1),
        createTile('wan', 3, 2),
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 6, 1),
        createTile('tiao', 6, 2),
        createTile('tiao', 9, 1),
        createTile('tiao', 9, 2),
        createTile('wan', 9, 1)
    ];

    assert.equal(canHu(gameState, 'south'), true);
});

test('isSevenPairsHand returns false when one tile is unpaired', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 3, 1),
        createTile('wan', 3, 2),
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 6, 1),
        createTile('tiao', 6, 2),
        createTile('tong', 4, 1),
        createTile('tong', 4, 2),
        createTile('tong', 9, 1),
        createTile('tong', 8, 1)
    ];

    assert.equal(mahjongCore.isSevenPairsHand(hand), false);
});

test('isDragonSevenPairsHand returns true when seven pairs include four identical tiles', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 1, 3),
        createTile('wan', 1, 4),
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 6, 1),
        createTile('tiao', 6, 2),
        createTile('tong', 4, 1),
        createTile('tong', 4, 2),
        createTile('tong', 9, 1),
        createTile('tong', 9, 2)
    ];

    assert.equal(mahjongCore.isDragonSevenPairsHand?.(hand), true);
});

test('isDragonSevenPairsHand returns false for seven pairs without four identical tiles', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 3, 1),
        createTile('wan', 3, 2),
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 6, 1),
        createTile('tiao', 6, 2),
        createTile('tong', 4, 1),
        createTile('tong', 4, 2),
        createTile('tong', 9, 1),
        createTile('tong', 9, 2)
    ];

    assert.equal(mahjongCore.isDragonSevenPairsHand(hand), false);
});

test('isPureOneSuitHand returns true when all tiles use the same suit', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('wan', 7, 1),
        createTile('wan', 8, 1),
        createTile('wan', 9, 1),
        createTile('wan', 9, 2)
    ];

    assert.equal(mahjongCore.isPureOneSuitHand?.(hand), true);
});

test('isPureOneSuitHand returns false when tiles use mixed suits', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('wan', 7, 1),
        createTile('wan', 8, 1),
        createTile('wan', 9, 1),
        createTile('tiao', 9, 2)
    ];

    assert.equal(mahjongCore.isPureOneSuitHand(hand), false);
});

test('isAllTripletsHand returns true for four triplets and one pair', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 1, 3),
        createTile('wan', 6, 1),
        createTile('wan', 6, 2),
        createTile('wan', 6, 3),
        createTile('tiao', 3, 1),
        createTile('tiao', 3, 2),
        createTile('tiao', 3, 3),
        createTile('tong', 8, 1),
        createTile('tong', 8, 2),
        createTile('tong', 8, 3),
        createTile('tong', 2, 1),
        createTile('tong', 2, 2)
    ];

    assert.equal(mahjongCore.isAllTripletsHand?.(hand), true);
});

test('isAllTripletsHand returns false when a winning hand contains sequences', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1),
        createTile('wan', 9, 2)
    ];

    assert.equal(isWinningHand(hand), true);
    assert.equal(mahjongCore.isAllTripletsHand(hand), false);
});

test('isTerminalPatternHand returns true when every group and pair contains one or nine', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 7, 1),
        createTile('wan', 8, 1),
        createTile('wan', 9, 1),
        createTile('tiao', 1, 1),
        createTile('tiao', 1, 2),
        createTile('tiao', 1, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 2),
        createTile('wan', 9, 3)
    ];

    assert.equal(isWinningHand(hand), true);
    assert.equal(mahjongCore.isTerminalPatternHand?.(hand), true);
});

test('isTerminalPatternHand returns false when a winning hand has a middle-only sequence', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 1, 1),
        createTile('tiao', 1, 2),
        createTile('tiao', 1, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1),
        createTile('wan', 9, 2)
    ];

    assert.equal(isWinningHand(hand), true);
    assert.equal(mahjongCore.isTerminalPatternHand(hand), false);
});

test('isTerminalPatternHand returns false when the pair is not one or nine', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 7, 1),
        createTile('wan', 8, 1),
        createTile('wan', 9, 1),
        createTile('tiao', 1, 1),
        createTile('tiao', 1, 2),
        createTile('tiao', 1, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 5, 1),
        createTile('wan', 5, 2)
    ];

    assert.equal(isWinningHand(hand), true);
    assert.equal(mahjongCore.isTerminalPatternHand(hand), false);
});

test('getTingTiles returns winning tiles for a 13-tile ready hand', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1)
    ];

    assert.deepEqual(mahjongCore.getTingTiles?.(hand), [
        { suit: 'wan', val: 9 }
    ]);
});

test('getTingTiles respects ding que suit and excludes forbidden winning tiles', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1)
    ];

    assert.deepEqual(mahjongCore.getTingTiles(hand, 'wan'), []);
});

test('getTingDiscardOptions returns discard choices and winning tiles for a 14-tile hand', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1),
        createTile('tong', 1, 1)
    ];

    assert.deepEqual(mahjongCore.getTingDiscardOptions?.(hand), [
        {
            discard: { suit: 'wan', val: 9 },
            discardIndex: 12,
            winningTiles: [{ suit: 'tong', val: 1 }]
        },
        {
            discard: { suit: 'tong', val: 1 },
            discardIndex: 13,
            winningTiles: [{ suit: 'wan', val: 9 }]
        }
    ]);
});

test('canTing returns false when no discard can make the player ready', () => {
    const gameState = createLocalRound();
    gameState.dingQue.south = 'tong';
    gameState.hands.south = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 2, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 4, 1),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1),
        createTile('wan', 9, 2)
    ];

    assert.equal(mahjongCore.canTing?.(gameState, 'south'), false);
});

test('inspectDrawnRoundCalling separates ready and no-ready players when the wall is empty', () => {
    const gameState = createLocalRound();
    gameState.wall = [];
    gameState.winners = ['east'];
    gameState.dingQue.south = 'tong';
    gameState.dingQue.north = 'tong';
    gameState.dingQue.west = 'tong';
    gameState.hands.south = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tiao', 7, 1),
        createTile('tiao', 8, 1),
        createTile('tiao', 9, 1),
        createTile('wan', 9, 1)
    ];
    gameState.hands.north = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 2, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 4, 1),
        createTile('wan', 7, 1),
        createTile('wan', 8, 1),
        createTile('wan', 9, 1),
        createTile('wan', 9, 2)
    ];
    gameState.hands.west = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('wan', 7, 1),
        createTile('wan', 8, 1),
        createTile('wan', 9, 1),
        createTile('wan', 9, 2),
        createTile('tiao', 1, 1)
    ];

    const inspection = mahjongCore.inspectDrawnRoundCalling?.(gameState);

    assert.equal(inspection.reason, 'wall_empty');
    assert.deepEqual(inspection.readyPlayers.map(result => result.player), ['south', 'west']);
    assert.deepEqual(inspection.noReadyPlayers, [{ player: 'north', handSize: 13 }]);
    assert.deepEqual(inspection.skippedWinners, ['east']);
    assert.deepEqual(inspection.readyPlayers[0].waitingTiles, [{ suit: 'wan', val: 9 }]);
    assert.equal(inspection.readyPlayers[1].discardOptions.some(option => (
        option.discard.suit === 'tiao'
        && option.discard.val === 1
        && option.winningTiles.some(tile => tile.suit === 'wan' && tile.val === 9)
    )), true);
});

test('inspectDrawnRoundCalling returns empty result before wall empty', () => {
    const gameState = createLocalRound();

    assert.deepEqual(mahjongCore.inspectDrawnRoundCalling(gameState), {
        reason: 'not_wall_empty',
        readyPlayers: [],
        noReadyPlayers: [],
        skippedWinners: []
    });
});

test('inspectDrawnRoundFlowerPigs finds players still holding their ding que suit', () => {
    const gameState = createLocalRound();
    gameState.wall = [];
    gameState.winners = ['east'];
    gameState.dingQue.south = 'tong';
    gameState.dingQue.north = 'tong';
    gameState.dingQue.west = 'wan';
    gameState.hands.south = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('tiao', 3, 1),
        createTile('tong', 7, 1),
        createTile('tong', 9, 1)
    ];
    gameState.hands.north = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('tiao', 3, 1),
        createTile('tiao', 7, 1)
    ];
    gameState.hands.west = [
        createTile('wan', 5, 1),
        createTile('wan', 8, 1),
        createTile('tiao', 1, 1)
    ];

    assert.deepEqual(mahjongCore.inspectDrawnRoundFlowerPigs?.(gameState), {
        reason: 'wall_empty',
        flowerPigPlayers: [
            {
                player: 'south',
                dingQueSuit: 'tong',
                remainingTiles: [
                    { suit: 'tong', val: 7 },
                    { suit: 'tong', val: 9 }
                ]
            },
            {
                player: 'west',
                dingQueSuit: 'wan',
                remainingTiles: [
                    { suit: 'wan', val: 5 },
                    { suit: 'wan', val: 8 }
                ]
            }
        ],
        cleanPlayers: ['north'],
        skippedWinners: ['east']
    });
});

test('inspectDrawnRoundFlowerPigs ignores the check before wall empty', () => {
    const gameState = createLocalRound();

    assert.deepEqual(mahjongCore.inspectDrawnRoundFlowerPigs(gameState), {
        reason: 'not_wall_empty',
        flowerPigPlayers: [],
        cleanPlayers: [],
        skippedWinners: []
    });
});

test('isWinningHand returns false when tiles cannot form legal groups and a pair', () => {
    const hand = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 2, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 4, 1),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1),
        createTile('wan', 9, 2)
    ];

    assert.equal(isWinningHand(hand), false);
});

test('canHu returns true when player can win with the last discard', () => {
    const gameState = createLocalRound();
    gameState.dingQue.south = 'tong';
    gameState.lastDiscard = {
        player: 'east',
        tile: createTile('wan', 9, 2)
    };
    gameState.hands.south = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tiao', 7, 1),
        createTile('tiao', 8, 1),
        createTile('tiao', 9, 1),
        createTile('wan', 9, 1)
    ];

    assert.equal(canHu(gameState, 'south'), true);
});

test('mustHuInLastFourTiles returns true when wall has four tiles left and player can hu', () => {
    const gameState = createLocalRound();
    gameState.wall = [
        createTile('wan', 7, 1),
        createTile('wan', 7, 2),
        createTile('wan', 8, 1),
        createTile('wan', 8, 2)
    ];
    gameState.dingQue.south = 'tong';
    gameState.lastDiscard = {
        player: 'east',
        tile: createTile('wan', 9, 2)
    };
    gameState.hands.south = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tiao', 7, 1),
        createTile('tiao', 8, 1),
        createTile('tiao', 9, 1),
        createTile('wan', 9, 1)
    ];

    assert.equal(mustHuInLastFourTiles(gameState, 'south'), true);
});

test('mustHuInLastFourTiles returns false before the last four wall tiles', () => {
    const gameState = createLocalRound();
    gameState.wall = [
        createTile('wan', 7, 1),
        createTile('wan', 7, 2),
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('wan', 9, 3)
    ];
    gameState.dingQue.south = 'tong';
    gameState.lastDiscard = {
        player: 'east',
        tile: createTile('wan', 9, 2)
    };
    gameState.hands.south = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tiao', 7, 1),
        createTile('tiao', 8, 1),
        createTile('tiao', 9, 1),
        createTile('wan', 9, 1)
    ];

    assert.equal(mustHuInLastFourTiles(gameState, 'south'), false);
});

test('mustHuInLastFourTiles returns false when player cannot hu with four wall tiles left', () => {
    const gameState = createLocalRound();
    gameState.wall = [
        createTile('wan', 7, 1),
        createTile('wan', 7, 2),
        createTile('wan', 8, 1),
        createTile('wan', 8, 2)
    ];
    gameState.dingQue.south = 'tong';
    gameState.lastDiscard = {
        player: 'east',
        tile: createTile('wan', 9, 2)
    };
    gameState.hands.south = [
        createTile('wan', 1, 1),
        createTile('wan', 1, 2),
        createTile('wan', 2, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 4, 1),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1)
    ];

    assert.equal(mustHuInLastFourTiles(gameState, 'south'), false);
});

test('canHu ignores stale last discard when player already has a drawn 14-tile winning hand', () => {
    const gameState = createLocalRound();
    gameState.dingQue.south = 'tiao';
    gameState.lastDiscard = {
        player: 'west',
        tile: createTile('tong', 5, 1)
    };
    gameState.hands.south = [
        createTile('tong', 1, 1),
        createTile('tong', 2, 1),
        createTile('tong', 3, 1),
        createTile('tong', 4, 1),
        createTile('tong', 5, 2),
        createTile('tong', 6, 1),
        createTile('wan', 2, 1),
        createTile('wan', 2, 2),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('wan', 7, 1),
        createTile('wan', 8, 1)
    ];

    assert.equal(canHu(gameState, 'south'), true);
});

test('performHu ignores stale last discard for self-drawn winning hand', () => {
    const gameState = createLocalRound();
    gameState.dingQue.south = 'tiao';
    gameState.lastDiscard = {
        player: 'west',
        tile: createTile('tong', 5, 1)
    };
    gameState.discards.west = [
        createTile('tong', 5, 1)
    ];
    gameState.hands.south = [
        createTile('tong', 1, 1),
        createTile('tong', 2, 1),
        createTile('tong', 3, 1),
        createTile('tong', 4, 1),
        createTile('tong', 5, 2),
        createTile('tong', 6, 1),
        createTile('wan', 2, 1),
        createTile('wan', 2, 2),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('wan', 7, 1),
        createTile('wan', 8, 1)
    ];

    const result = performHu(gameState, 'south');

    assert.equal(result.tile.id, 'wan-8-1');
    assert.deepEqual(gameState.discards.west.map(tile => tile.id), ['tong-5-1']);
    assert.deepEqual(gameState.winners, ['south']);
});

test('canHu returns false when player still has ding que suit tiles', () => {
    const gameState = createLocalRound();
    gameState.dingQue.south = 'tong';
    gameState.hands.south = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tong', 7, 1),
        createTile('tong', 8, 1),
        createTile('tong', 9, 1),
        createTile('wan', 9, 1),
        createTile('wan', 9, 2)
    ];

    assert.equal(canHu(gameState, 'south'), false);
});

test('performHu records winner and removes the winning discard from discard pile', () => {
    const gameState = createLocalRound();
    const winningTile = createTile('wan', 9, 2);
    gameState.dingQue.south = 'tong';
    gameState.lastDiscard = {
        player: 'east',
        tile: winningTile
    };
    gameState.discards.east = [
        createTile('tiao', 1, 1),
        winningTile
    ];
    gameState.hands.south = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tiao', 7, 1),
        createTile('tiao', 8, 1),
        createTile('tiao', 9, 1),
        createTile('wan', 9, 1)
    ];

    const result = performHu(gameState, 'south');

    assert.equal(result.player, 'south');
    assert.equal(result.tile.id, 'wan-9-2');
    assert.deepEqual(gameState.winners, ['south']);
    assert.deepEqual(gameState.discards.east.map(tile => tile.id), ['tiao-1-1']);
    assert.equal(gameState.lastDiscard, null);
});

test('getRoundSettlement combines hu and gang records into zero-sum player scores', () => {
    const gameState = createLocalRound();
    gameState.gangSettlements = [{
        type: 'wind',
        scoreDeltas: { south: 2, east: -2, north: 0, west: 0 },
        payments: [{ from: 'east', to: 'south', points: 2 }]
    }];
    gameState.huRecords = [{
        player: 'south',
        from: 'east',
        isSelfDraw: false,
        tiles: [
            createTile('wan', 1, 1), createTile('wan', 2, 1), createTile('wan', 3, 1),
            createTile('wan', 4, 1), createTile('wan', 5, 1), createTile('wan', 6, 1),
            createTile('wan', 7, 1), createTile('wan', 8, 1), createTile('wan', 9, 1),
            createTile('wan', 2, 2), createTile('wan', 3, 2), createTile('wan', 4, 2),
            createTile('wan', 5, 2), createTile('wan', 5, 3)
        ]
    }];

    const settlement = getRoundSettlement(gameState);

    assert.equal(settlement.scoreDeltas.south, 10);
    assert.equal(settlement.scoreDeltas.east, -10);
    assert.equal(settlement.scoreDeltas.north, 0);
    assert.equal(settlement.scoreDeltas.west, 0);
    assert.equal(Object.values(settlement.scoreDeltas).reduce((sum, value) => sum + value, 0), 0);
    assert.deepEqual(settlement.details.south.slice(0, 2), [
        { name: '刮风（明杠）', points: 2 },
        { name: '清一色', fan: 3 }
    ]);
});

test('chooseAutoReaction chooses hu before gang and peng for computer players', () => {
    const gameState = createLocalRound();
    const discardedTile = createTile('wan', 9, 4);
    gameState.currentPlayer = 'south';
    gameState.lastDiscard = {
        player: 'south',
        tile: discardedTile
    };
    gameState.discards.south = [discardedTile];
    gameState.dingQue.east = 'tong';
    gameState.dingQue.north = 'tong';
    gameState.dingQue.west = 'tong';
    gameState.hands.east = [
        createTile('wan', 9, 1),
        createTile('wan', 9, 2),
        createTile('tiao', 1, 1)
    ];
    gameState.hands.north = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 2, 2),
        createTile('tiao', 2, 3),
        createTile('tiao', 7, 1),
        createTile('tiao', 8, 1),
        createTile('tiao', 9, 1),
        createTile('wan', 9, 3)
    ];
    gameState.hands.west = [
        createTile('wan', 9, 1),
        createTile('wan', 9, 2),
        createTile('wan', 9, 3),
        createTile('tiao', 1, 1)
    ];

    const reaction = chooseAutoReaction(gameState, ['east', 'north', 'west']);

    assert.deepEqual(reaction, {
        player: 'north',
        action: 'hu'
    });
});

test('chooseAutoReaction resolves equal-priority reactions from the next player after the discarder', () => {
    const gameState = createLocalRound();
    const discarded = createTile('wan', 6, 1);
    gameState.lastDiscard = { player: 'east', tile: discarded };
    gameState.discards.east = [discarded];
    gameState.hands.north = [
        createTile('wan', 6, 2),
        createTile('wan', 6, 3),
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 4, 1),
        createTile('wan', 7, 1),
        createTile('wan', 9, 1),
        createTile('tiao', 1, 1),
        createTile('tiao', 3, 1),
        createTile('tiao', 5, 1),
        createTile('tiao', 7, 1),
        createTile('tiao', 9, 1),
        createTile('tong', 1, 1)
    ];
    gameState.hands.south = [
        createTile('wan', 6, 4),
        createTile('wan', 6, 2),
        createTile('wan', 1, 2),
        createTile('wan', 2, 2),
        createTile('wan', 4, 2),
        createTile('wan', 7, 2),
        createTile('wan', 9, 2),
        createTile('tiao', 1, 2),
        createTile('tiao', 3, 2),
        createTile('tiao', 5, 2),
        createTile('tiao', 7, 2),
        createTile('tiao', 9, 2),
        createTile('tong', 1, 2)
    ];

    const reaction = chooseAutoReaction(gameState);

    assert.deepEqual(reaction, { player: 'north', action: 'peng' });
});

test('performAutoReaction performs peng and clears the claimed discard', () => {
    const gameState = createLocalRound();
    const discardedTile = createTile('tong', 5, 1);
    gameState.currentPlayer = 'south';
    gameState.lastDiscard = {
        player: 'south',
        tile: discardedTile
    };
    gameState.discards.south = [
        createTile('wan', 1, 1),
        discardedTile
    ];
    gameState.hands.east = [
        createTile('tong', 5, 2),
        createTile('tong', 5, 3),
        createTile('wan', 2, 1),
        createTile('tiao', 9, 1)
    ];

    const reaction = performAutoReaction(gameState, ['east']);

    assert.equal(reaction.action, 'peng');
    assert.equal(reaction.player, 'east');
    assert.equal(reaction.result.type, 'peng');
    assert.equal(gameState.currentPlayer, 'east');
    assert.equal(gameState.lastDiscard, null);
    assert.deepEqual(gameState.discards.south.map(tile => tile.id), ['wan-1-1']);
    assert.equal(gameState.melds.east.length, 1);
});

test('chooseAutoReaction passes when a player only has a concealed gang unrelated to the discard', () => {
    const gameState = createLocalRound();
    gameState.lastDiscard = {
        player: 'south',
        tile: createTile('tong', 5, 1)
    };
    gameState.hands.east = [
        createTile('wan', 8, 1),
        createTile('wan', 8, 2),
        createTile('wan', 8, 3),
        createTile('wan', 8, 4),
        createTile('tiao', 1, 1)
    ];

    assert.equal(chooseAutoReaction(gameState, ['east']), null);
});

test('advanceToNextPlayer moves to next active player and draws one tile when needed', () => {
    const gameState = createLocalRound();
    gameState.currentPlayer = 'south';
    gameState.hands.east = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('wan', 7, 1),
        createTile('wan', 8, 1),
        createTile('wan', 9, 1),
        createTile('tiao', 1, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 3, 1),
        createTile('tiao', 4, 1)
    ];
    gameState.wall = [createTile('tong', 9, 1), ...gameState.wall];
    const beforeWallCount = gameState.wall.length;

    const result = advanceToNextPlayer(gameState);

    assert.equal(result.player, 'east');
    assert.equal(result.drawn.val, 9);
    assert.equal(gameState.currentPlayer, 'east');
    assert.equal(gameState.hands.east.length, 14);
    assert.equal(gameState.wall.length, beforeWallCount - 1);
});

test('advanceToNextPlayer clears an unclaimed discard before the next player draws', () => {
    const gameState = createLocalRound();
    const discarded = createTile('tong', 5, 1);
    gameState.currentPlayer = 'east';
    gameState.lastDiscard = { player: 'east', tile: discarded };
    gameState.discards.east = [discarded];

    const result = advanceToNextPlayer(gameState);

    assert.equal(result.player, 'north');
    assert.equal(gameState.lastDiscard, null);
    assert.ok(result.drawn);
});

test('advanceToNextPlayer skips players who already won', () => {
    const gameState = createLocalRound();
    gameState.currentPlayer = 'south';
    gameState.winners = ['east'];
    gameState.hands.north = [
        createTile('wan', 1, 1),
        createTile('wan', 2, 1),
        createTile('wan', 3, 1),
        createTile('wan', 4, 1),
        createTile('wan', 5, 1),
        createTile('wan', 6, 1),
        createTile('wan', 7, 1),
        createTile('wan', 8, 1),
        createTile('wan', 9, 1),
        createTile('tiao', 1, 1),
        createTile('tiao', 2, 1),
        createTile('tiao', 3, 1),
        createTile('tiao', 4, 1)
    ];
    gameState.wall = [createTile('tong', 9, 1), ...gameState.wall];

    const result = advanceToNextPlayer(gameState);

    assert.equal(result.player, 'north');
    assert.equal(gameState.currentPlayer, 'north');
    assert.equal(gameState.hands.north.length, 14);
});

test('isRoundOver ends the round when the wall is empty', () => {
    const gameState = createLocalRound();
    gameState.wall = [];

    const result = isRoundOver(gameState);

    assert.equal(result.over, true);
    assert.equal(result.reason, 'wall_empty');
});

test('isRoundOver ends the round when only one player has not won', () => {
    const gameState = createLocalRound();
    gameState.winners = ['south', 'east', 'north'];

    const result = isRoundOver(gameState);

    assert.equal(result.over, true);
    assert.equal(result.reason, 'last_player_left');
});

test('isRoundOver keeps the round active when wall remains and fewer than three players won', () => {
    const gameState = createLocalRound();
    gameState.winners = ['south'];

    const result = isRoundOver(gameState);

    assert.equal(result.over, false);
    assert.equal(result.reason, '');
});
