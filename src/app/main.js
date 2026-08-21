import { getTileSVG as renderTileSVG } from '../tileSvg.js';
import { initErrorLogger } from '../errorLogger.js';
import { describeServerConfig, getServerHttpUrl, getServerWsUrl, setServerOriginOverride } from '../config.js';
import { createAccountClient } from '../accountClient.js';
import { clearSession, loadSession, loadToken, saveSession, saveToken, updateSessionCoins } from '../sessionStore.js';
import { normalizeServerGameState } from '../onlineGameState.js';
import {
    getActiveTheme,
    initTheme,
    setTheme,
    THEME_CONFIG
} from '../themeManager.js';
import {
    AUTO_PLAY_DELAYS,
    COMPONENT_OPTIONS,
    DEFAULT_GAME_SETTINGS,
    getThemeLabel,
    updateGameSetting
} from '../settingsManager.js';
import {
    PLAYER_ORDER,
    advanceToNextPlayer,
    autoDiscardForPlayer,
    canGang,
    canHu,
    canPeng,
    chooseAutoReaction,
    chooseAutoDingQueSuit,
    createLocalRound,
    createTile,
    discardFromHand,
    getDingQueDisplayViews,
    getDiscardPileViews,
    getQueName,
    getOpponentHandBackViews,
    getPlayerHandView,
    getRoundSettlement,
    mustHuInLastFourTiles,
    performAutoReaction,
    performGang,
    performHu,
    performPeng,
    sortTiles
} from '../mahjongCore.js';

/* ==========================================================================
   绉戝够楹诲皢鐣岄潰灞曠ず鏌?- 浜や簰寮曟搸
   ========================================================================== */

// 鐗岄潰 SVG 娓叉煋鍦?src/tileSvg.js锛屾父鎴忔暟鎹緟鍔╁嚱鏁板湪 src/mahjongCore.js銆?
// --- 鐜╁鐘舵€佹満涓庡ご鍍忓鐞?---
initErrorLogger();

const AVATAR_STOCKS = {
    commander: 'avatar_commander.png',
    cyber_bird: 'avatar_cyber_bird.png',
    matrix_cat: 'avatar_matrix_cat.png',
    neon_wolf: 'avatar_neon_wolf.png'
};

function initAvatars() {
    const assignAvatar = (imgId, key, genderColor) => {
        const img = document.getElementById(imgId);
        if (img) {
            img.src = `/${AVATAR_STOCKS[key]}`;
            img.onerror = () => {
                img.src = `data:image/svg+xml;utf8,
                <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <rect width="100%" height="100%" fill="%230b1321" />
                    <circle cx="50" cy="50" r="30" fill="none" stroke="${genderColor}" stroke-width="2" />
                    <circle cx="50" cy="40" r="12" fill="${genderColor}" fill-opacity="0.3" />
                    <path d="M 25 75 Q 50 55 75 75 Z" fill="${genderColor}" fill-opacity="0.5" />
                    <path d="M 10 10 L 90 90 M 90 10 L 10 90" stroke="${genderColor}" stroke-width="0.5" stroke-opacity="0.2" />
                </svg>`;
            };
        }
    };

    assignAvatar('img-south', 'commander', '%2300f3ff');
    assignAvatar('img-east', 'matrix_cat', '%23ff007f');
    assignAvatar('img-north', 'cyber_bird', '%2300ffaa');
    assignAvatar('img-west', 'neon_wolf', '%23ff9900');

    const assignSetAvatar = (imgSelector, key, color) => {
        const imgs = document.querySelectorAll(imgSelector);
        imgs.forEach(img => {
            img.src = `/${AVATAR_STOCKS[key]}`;
            img.onerror = () => {
                img.src = `data:image/svg+xml;utf8,
                <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <rect width="100%" height="100%" fill="%230b1321" />
                    <circle cx="50" cy="50" r="30" fill="none" stroke="${color}" stroke-width="2" />
                    <circle cx="50" cy="40" r="12" fill="${color}" fill-opacity="0.3" />
                    <path d="M 25 75 Q 50 55 75 75 Z" fill="${color}" fill-opacity="0.5" />
                </svg>`;
            };
        });
    };

    assignSetAvatar('.set-img-1', 'commander', '%2300f3ff');
    assignSetAvatar('.set-img-2', 'cyber_bird', '%2300ffaa');
    assignSetAvatar('.set-img-3', 'matrix_cat', '%23ff007f');
    assignSetAvatar('.set-img-4', 'neon_wolf', '%23ff9900');
    
    assignSetAvatar('.demo-img-1', 'commander', '%2300f3ff');
    assignSetAvatar('.demo-img-2', 'commander', '%2300ffaa');
    assignSetAvatar('.demo-img-3', 'commander', '%23ff9900');
    assignSetAvatar('.demo-img-4', 'commander', '%23ff007f');
}

function testAvatarState(playerId, state) {
    const card = document.getElementById(`avatar-${playerId}`);
    if (!card) return;

    card.classList.remove('active-turn');
    const frame = card.querySelector('.avatar-frame');
    const overlay = card.querySelector('.status-overlay');

    frame.style.borderColor = '';
    frame.style.boxShadow = '';

    if (state === 'active') {
        card.classList.add('active-turn');
        overlay.innerText = '行动中';
        overlay.style.backgroundColor = 'rgba(0, 243, 255, 0.8)';
        logTerminal(`[系统] 玩家状态已更新：行动中，状态正常`);
    } else if (state === 'esc') {
        overlay.innerText = '已胡';
        overlay.style.backgroundColor = 'rgba(0, 255, 170, 0.8)';
        frame.style.borderColor = 'var(--green)';
        frame.style.boxShadow = 'var(--green-glow)';
        logTerminal(`[系统] 玩家状态已更新：已胡，安全退场`);
    } else if (state === 'alert') {
        overlay.innerText = '警戒';
        overlay.style.backgroundColor = 'rgba(255, 153, 0, 0.8)';
        frame.style.borderColor = 'var(--orange)';
        frame.style.boxShadow = 'var(--orange-glow)';
        logTerminal(`[警告] 刮风下雨触发！`);
    } else if (state === 'bankrupt') {
        overlay.innerText = '破产';
        overlay.style.backgroundColor = 'rgba(255, 0, 127, 0.8)';
        frame.style.borderColor = 'var(--magenta)';
        frame.style.boxShadow = 'var(--magenta-glow)';
        logTerminal(`[严重警告] 积分耗尽，系统强制离线。`);
    }
}

// --- 鎴樻湳鏃ュ織绯荤粺 ---
function logTerminal(message) {
    const logBox = document.getElementById('terminal-logs');
    if (!logBox) return;
    
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'log-line';
    
    if (message.includes('警告') || message.includes('严重')) {
        line.className += ' text-magenta';
    } else if (message.includes('定缺')) {
        line.className += ' text-orange';
    } else if (message.includes('已胡')) {
        line.className += ' text-green';
    }

    line.innerText = `[${time}] ${message}`;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
}

// --- 鍔ㄦ€佸睍绀烘煖濉厖 ---
function populateShowroom() {
    const listDots = document.getElementById('showroom-dots-grid');
    const listBamboos = document.getElementById('showroom-bamboos-grid');
    const listChars = document.getElementById('showroom-characters-grid');

    // 1. 填充 Tab 1 中的九宫格牌面设计展示
    if (listDots && listBamboos && listChars) {
        for (let i = 1; i <= 9; i++) {
            const dotBox = document.createElement('div');
            dotBox.className = 'mahjong-tile';
            dotBox.innerHTML = `<div class="tile-face">${renderTileSVG('tong', i)}</div>`;
            dotBox.title = `${i}筒`;
            listDots.appendChild(dotBox);

            const bambooBox = document.createElement('div');
            bambooBox.className = 'mahjong-tile';
            bambooBox.innerHTML = `<div class="tile-face">${renderTileSVG('tiao', i)}</div>`;
            bambooBox.title = `${i}条`;
            listBamboos.appendChild(bambooBox);

            const charBox = document.createElement('div');
            charBox.className = 'mahjong-tile';
            charBox.innerHTML = `<div class="tile-face">${renderTileSVG('wan', i)}</div>`;
            charBox.title = `${i}万`;
            listChars.appendChild(charBox);
        }
    }

    // 2. 填充 Tab 4 演示牌桌的牌河弃牌
    const showDiscard = document.getElementById('showroom-discard-pool');
    if (showDiscard) {
        const discardTiles = [
            {suit: 'wan', val: 9},
            {suit: 'tong', val: 2},
            {suit: 'tiao', val: 1}
        ];
        showDiscard.innerHTML = discardTiles.map(t => `
            <div class="mahjong-tile mini-tile">
                <div class="tile-face">${renderTileSVG(t.suit, t.val)}</div>
            </div>
        `).join('');
    }
}

// --- 手牌交互逻辑 ---
// 首页阶段不提前洗牌发牌；玩家点击“进入房间”后才创建本地牌局。
let GAME_STATE = null;
let USER_HAND = [];
let GAME_HAS_STARTED = false;

let DING_QUE_SUIT = '';
let IS_AUTO_PLAYING = false;
let ROUND_END_ALERT_SHOWN = false;
let IS_WAITING_FOR_REACTION = false;
const USER_REACTION_TIMEOUT_MS = 10000;
let USER_REACTION_TIMER = null;
let USER_REACTION_DEADLINE = 0;
const GAME_SETTINGS_STORAGE_KEY = 'scifi-mahjong-game-settings';

function loadGameSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(GAME_SETTINGS_STORAGE_KEY) || '{}');
        return { ...DEFAULT_GAME_SETTINGS, ...saved };
    } catch {
        return { ...DEFAULT_GAME_SETTINGS };
    }
}

function saveGameSettings() {
    try {
        localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(GAME_SETTINGS));
    } catch {
        // 隐私模式等情况下无法写入时，当前页面的设置仍然有效。
    }
}

let GAME_SETTINGS = loadGameSettings();
let AUDIO_CONTEXT = null;
let BACKGROUND_MUSIC_TIMER = null;
let LAST_COUNTDOWN_SOUND = null;
let ROOM_SOCKET = null;
const ONLINE_PLAYER_STORAGE_KEY = 'scifi-mahjong-online-player-id';
const LAST_ROOM_STORAGE_KEY = 'scifi-mahjong-last-room';
// 旧版 Android WebView 没有 crypto.randomUUID；这里提供不依赖该接口的兼容编号。
function createClientId() {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    const randomPart = Math.random().toString(36).slice(2, 12);
    return `${Date.now().toString(36)}-${randomPart}`;
}
const savedOnlinePlayerId = localStorage.getItem(ONLINE_PLAYER_STORAGE_KEY);
const ONLINE_PLAYER = { id: savedOnlinePlayerId || `south-${createClientId()}`, name: '你' };
if (!savedOnlinePlayerId) localStorage.setItem(ONLINE_PLAYER_STORAGE_KEY, ONLINE_PLAYER.id);
let ONLINE_ROOM = null;

const PLAYER_NAMES = {
    south: '你',
    east: '矩阵猫',
    north: '赛博飞鸟',
    west: '霓虹狼'
};

const QUE_TEXT_CLASS = {
    wan: 'text-cyan',
    tiao: 'text-green',
    tong: 'text-orange'
};

const SOUND_PROFILES = {
    draw: { frequency: 520, duration: 0.07, type: 'sine', volume: 0.35 },
    discard: { frequency: 210, duration: 0.09, type: 'triangle', volume: 0.45 },
    peng: { frequency: 380, duration: 0.12, type: 'square', volume: 0.32 },
    gang: { frequency: 160, duration: 0.18, type: 'sawtooth', volume: 0.34 },
    hu: { frequency: 740, duration: 0.3, type: 'sine', volume: 0.42 },
    countdown: { frequency: 880, duration: 0.05, type: 'square', volume: 0.2 },
    background: { frequency: 110, duration: 0.5, type: 'sine', volume: 0.08 }
};

function playGameSound(soundName) {
    if (!GAME_SETTINGS.sound) return;
    const profile = SOUND_PROFILES[soundName];
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!profile || !AudioContextClass) return;
    AUDIO_CONTEXT ||= new AudioContextClass();
    if (AUDIO_CONTEXT.state === 'suspended') AUDIO_CONTEXT.resume();
    const oscillator = AUDIO_CONTEXT.createOscillator();
    const gain = AUDIO_CONTEXT.createGain();
    const startAt = AUDIO_CONTEXT.currentTime;
    oscillator.type = profile.type;
    oscillator.frequency.setValueAtTime(profile.frequency, startAt);
    gain.gain.setValueAtTime(profile.volume * GAME_SETTINGS.volume, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + profile.duration);
    oscillator.connect(gain).connect(AUDIO_CONTEXT.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + profile.duration);
}

function refreshBackgroundMusic() {
    if (BACKGROUND_MUSIC_TIMER) clearInterval(BACKGROUND_MUSIC_TIMER);
    BACKGROUND_MUSIC_TIMER = null;
    if (!GAME_SETTINGS.sound || !GAME_SETTINGS.music) return;
    playGameSound('background');
    BACKGROUND_MUSIC_TIMER = setInterval(() => playGameSound('background'), 1400);
}

function isUserTurn() {
    return GAME_STATE.phase === 'playing'
        && GAME_STATE.currentPlayer === 'south'
        && !IS_AUTO_PLAYING
        && !GAME_STATE.winners.includes('south');
}

function getPlayerName(player) {
    return PLAYER_NAMES[player] || player;
}

function getRoundEndMessage(reason) {
    if (reason === 'wall_empty') return '牌墙已经摸完，本局进入流局。';
    if (reason === 'last_player_left') return '只剩最后一名玩家未胡，本局结束。';
    return '本局已经结束。';
}

function ensureReactionCountdown() {
    const actionDock = document.getElementById('action-dock');
    if (!actionDock) return null;

    let countdown = document.getElementById('reaction-countdown');
    if (!countdown) {
        countdown = document.createElement('div');
        countdown.id = 'reaction-countdown';
        countdown.className = 'reaction-countdown font-share';
        actionDock.prepend(countdown);
    }

    return countdown;
}

function updateReactionCountdown() {
    const countdown = ensureReactionCountdown();
    if (!countdown) return;

    if (!IS_WAITING_FOR_REACTION || !USER_REACTION_DEADLINE) {
        countdown.hidden = true;
        countdown.innerText = '';
        return;
    }

    const secondsLeft = Math.max(0, Math.ceil((USER_REACTION_DEADLINE - Date.now()) / 1000));
    countdown.hidden = false;
    countdown.innerText = `等待操作：${secondsLeft}秒`;
    if (secondsLeft <= 3 && secondsLeft > 0 && LAST_COUNTDOWN_SOUND !== secondsLeft) {
        LAST_COUNTDOWN_SOUND = secondsLeft;
        playGameSound('countdown');
    }
}

function clearUserReactionTimeout() {
    if (USER_REACTION_TIMER) {
        clearInterval(USER_REACTION_TIMER);
        USER_REACTION_TIMER = null;
    }

    USER_REACTION_DEADLINE = 0;
    updateReactionCountdown();
}

function autoPassUserReaction() {
    if (!IS_WAITING_FOR_REACTION) return;

    if (mustHuInLastFourTiles(GAME_STATE, 'south')) {
        const result = performHu(GAME_STATE, 'south');
        clearUserReactionTimeout();
        IS_WAITING_FOR_REACTION = false;
        IS_AUTO_PLAYING = false;

        if (result) {
            triggerHoloAlert('胡', '最后4张有胡必胡', 'magenta');
            logTerminal(`[规则] 最后4张有胡必胡，系统已自动胡 ${result.tile.val}${getQueName(result.tile.suit)}。`);
            testAvatarState('south', 'esc');
        }

        renderGameState();
        if (GAME_STATE.phase !== 'round_over') {
            setTimeout(() => {
                runOpponentTurnsUntilUser();
            }, AUTO_PLAY_DELAYS.afterReactionBeforeContinue);
        }
        return;
    }

    clearUserReactionTimeout();
    IS_WAITING_FOR_REACTION = false;
    IS_AUTO_PLAYING = true;
    logTerminal(`[系统] 等待 10 秒超时，已自动为你选择“过”。`);
    renderGameState();

    setTimeout(() => {
        runOpponentTurnsUntilUser();
    }, AUTO_PLAY_DELAYS.afterUserPass);
}

function continueAfterUserHu() {
    if (GAME_STATE.phase === 'round_over') {
        handleRoundOverIfNeeded();
        return;
    }

    // 血战到底不是一人胡牌就结束：已胡玩家退出，剩余玩家继续轮流摸打。
    IS_AUTO_PLAYING = true;
    setTimeout(() => {
        runOpponentTurnsUntilUser();
    }, AUTO_PLAY_DELAYS.afterReactionBeforeContinue);
}

function startUserReactionTimeout() {
    clearUserReactionTimeout();
    USER_REACTION_DEADLINE = Date.now() + USER_REACTION_TIMEOUT_MS;
    LAST_COUNTDOWN_SOUND = null;
    updateReactionCountdown();

    USER_REACTION_TIMER = setInterval(() => {
        if (!IS_WAITING_FOR_REACTION) {
            clearUserReactionTimeout();
            return;
        }

        if (Date.now() >= USER_REACTION_DEADLINE) {
            autoPassUserReaction();
            return;
        }

        updateReactionCountdown();
    }, 250);
}

function triggerRoundEndAlert(reason) {
    if (ROUND_END_ALERT_SHOWN) return;
    ROUND_END_ALERT_SHOWN = true;

    if (reason === 'wall_empty') {
        triggerHoloAlert('流局', '牌墙摸完，本局流局', 'cyan');
        return;
    }

    triggerHoloAlert('终局', getRoundEndMessage(reason), 'green');
}

function assignOpponentDingQue() {
    ['east', 'north', 'west'].forEach(player => {
        GAME_STATE.dingQue[player] = chooseAutoDingQueSuit(GAME_STATE.hands[player]);
        logTerminal(`[定缺] ${getPlayerName(player)}选择定缺：${getQueName(GAME_STATE.dingQue[player])}`);
    });
}

function setGangTestRound(type) {
    if (!type) return false;

    GAME_STATE.phase = 'playing';
    GAME_STATE.currentPlayer = 'south';
    GAME_STATE.lastDiscard = null;
    GAME_STATE.wall = [
        createTile('tiao', 9, 4),
        createTile('wan', 9, 4),
        createTile('tong', 9, 4)
    ];
    GAME_STATE.dingQue = {
        south: 'tong',
        east: 'wan',
        north: 'wan',
        west: 'wan'
    };
    DING_QUE_SUIT = 'tong';
    IS_AUTO_PLAYING = false;
    IS_WAITING_FOR_REACTION = false;

    const logBox = document.getElementById('terminal-logs');
    if (logBox) {
        logBox.innerHTML = '';
    }

    if (type === 'an') {
        GAME_STATE.hands.south = [
            createTile('wan', 8, 1),
            createTile('wan', 8, 2),
            createTile('wan', 8, 3),
            createTile('wan', 8, 4),
            createTile('wan', 1, 1),
            createTile('wan', 2, 1),
            createTile('wan', 3, 1),
            createTile('wan', 4, 1),
            createTile('wan', 5, 1),
            createTile('tiao', 1, 1),
            createTile('tiao', 2, 1),
            createTile('tiao', 3, 1),
            createTile('tiao', 4, 1),
            createTile('tiao', 5, 1)
        ];
        GAME_STATE.melds.south = [];
        logTerminal(`[测试] 已进入暗杠测试：你手里有 4 张 8万，可以直接点“杠”。`);
    } else if (type === 'bu') {
        GAME_STATE.hands.south = [
            createTile('tong', 3, 4),
            createTile('wan', 1, 1),
            createTile('wan', 2, 1),
            createTile('wan', 3, 1),
            createTile('wan', 4, 1),
            createTile('wan', 5, 1),
            createTile('tiao', 1, 1),
            createTile('tiao', 2, 1),
            createTile('tiao', 3, 1),
            createTile('tiao', 4, 1),
            createTile('tiao', 5, 1),
            createTile('tiao', 6, 1),
            createTile('tiao', 7, 1),
            createTile('tiao', 8, 1)
        ];
        GAME_STATE.melds.south = [{
            type: 'peng',
            from: 'east',
            tiles: [
                createTile('tong', 3, 1),
                createTile('tong', 3, 2),
                createTile('tong', 3, 3)
            ]
        }];
        logTerminal(`[测试] 已进入补杠测试：你已经碰出 3筒，手里有第 4 张 3筒，可以点“杠”。`);
    } else {
        return false;
    }

    const dingQuePanel = document.getElementById('dingque-overlay');
    if (dingQuePanel) {
        dingQuePanel.style.display = 'none';
    }

    const actionDock = document.getElementById('action-dock');
    if (actionDock) {
        actionDock.classList.add('is-visible');
    }

    const userQueDisplay = document.getElementById('user-que-display');
    if (userQueDisplay) {
        userQueDisplay.innerText = `定缺：${getQueName(DING_QUE_SUIT)}`;
    }

    USER_HAND = GAME_STATE.hands.south;
    return true;
}

function renderUserHand() {
    const handBox = document.getElementById('user-hand-container');
    if (!handBox) return;

    handBox.innerHTML = '';

    const handView = getPlayerHandView(GAME_STATE, 'south');
    GAME_STATE.hands.south = handView.map(item => item.tile);
    USER_HAND = GAME_STATE.hands.south;

    handView.forEach(({ tile, index, disabled, recommended }) => {
        const tileDiv = document.createElement('div');
        tileDiv.className = 'mahjong-tile';

        if (disabled) {
            tileDiv.classList.add('que-disabled');
        }

        if (recommended && GAME_SETTINGS.newbieGuide) {
            tileDiv.classList.add('recommended-discard');
        }

        if (!isUserTurn()) {
            tileDiv.classList.add('que-disabled');
        }

        tileDiv.innerHTML = `<div class="tile-face">${renderTileSVG(tile.suit, tile.val)}</div>`;

        tileDiv.addEventListener('click', () => {
            if (!isUserTurn()) {
                logTerminal(`[系统] 现在还没有轮到你出牌，请等待对手行动。`);
                return;
            }

            if (disabled) {
                logTerminal(`[警告] 你必须先打完定缺的「${getQueName(DING_QUE_SUIT)}」牌！`);
                tileDiv.style.animation = 'shake-anim 0.3s';
                setTimeout(() => tileDiv.style.animation = '', 300);
                return;
            }
            discardTile(index);
        });

        handBox.appendChild(tileDiv);
    });
}

function ensurePlayerMeldContainer(player) {
    const isUser = player === 'south';
    const handBox = isUser 
        ? document.getElementById('user-hand-container')
        : document.querySelector(`.player-${player} .opponent-hand`);
    if (!handBox) return null;

    let meldBox = document.getElementById(`${player}-meld-container`);
    if (!meldBox) {
        meldBox = document.createElement('div');
        meldBox.id = `${player}-meld-container`;
        meldBox.className = `player-melds melds-${player}`;
        
        // Insert relative to the hand container
        if (player === 'south') {
            // South: insert before user hand (between avatar and hand)
            handBox.insertAdjacentElement('beforebegin', meldBox);
        } else if (player === 'north') {
            // North: insert after hand (between hand and avatar)
            handBox.insertAdjacentElement('afterend', meldBox);
        } else if (player === 'west') {
            // West: insert before hand (between avatar and hand)
            handBox.insertAdjacentElement('beforebegin', meldBox);
        } else if (player === 'east') {
            // East: insert after hand (between hand and avatar)
            handBox.insertAdjacentElement('afterend', meldBox);
        }
    }
    return meldBox;
}

function renderPlayerMelds(player) {
    const meldBox = ensurePlayerMeldContainer(player);
    if (!meldBox) return;

    const melds = GAME_STATE.melds?.[player] || [];
    meldBox.innerHTML = '';
    meldBox.hidden = melds.length === 0;

    melds.forEach(meld => {
        const group = document.createElement('div');
        group.className = 'meld-group';

        meld.tiles.forEach(tile => {
            const tileBox = document.createElement('div');
            tileBox.className = 'mahjong-tile meld-tile';
            tileBox.innerHTML = `<div class="tile-face">${renderTileSVG(tile.suit, tile.val)}</div>`;
            group.appendChild(tileBox);
        });

        meldBox.appendChild(group);
    });
}

function discardTile(index) {
    if (!isUserTurn()) return;
    if (GAME_STATE.phase === 'round_over') {
        logTerminal(`[系统] ${getRoundEndMessage(GAME_STATE.endReason)}`);
        triggerRoundEndAlert(GAME_STATE.endReason);
        return;
    }

    if (mustHuInLastFourTiles(GAME_STATE, 'south')) {
        logTerminal(`[规则] 最后4张有胡必胡，当前不能继续出牌，请点击“胡”。`);
        triggerHoloAlert('胡', '最后4张有胡必胡', 'magenta');
        renderGameState();
        return;
    }

    const tileObj = discardFromHand(GAME_STATE, 'south', index);
    if (!tileObj) return;

    IS_AUTO_PLAYING = true;
    USER_HAND = GAME_STATE.hands.south;
    logTerminal(`[操作] 你打出了：${tileObj.val}${getQueName(tileObj.suit)}`);
    playGameSound('discard');

    renderGameState();
    
    setTimeout(() => {
        handleReactionAfterDiscard();
    }, AUTO_PLAY_DELAYS.afterDiscardBeforeReaction);
}

function addTileToDiscardPool(player, tile) {
    const pool = getDiscardPool(player);
    if (!pool) return;

    const tileBox = document.createElement('div');
    tileBox.className = 'mahjong-tile mini-tile';
    tileBox.style.width = '24px';
    tileBox.style.height = '34px';
    tileBox.innerHTML = `<div class="tile-face">${renderTileSVG(tile.suit, tile.val)}</div>`;
    pool.appendChild(tileBox);
}

function getDiscardPool(player) {
    return document.getElementById(`discard-${player}-pool`) || document.querySelector(`.grid-${player}`);
}

function renderDiscardPiles() {
    getDiscardPileViews(GAME_STATE).forEach(({ player, tiles }) => {
        const pool = getDiscardPool(player);
        if (!pool) return;

        pool.innerHTML = '';
        tiles.forEach(tile => addTileToDiscardPool(player, tile));
    });
}

function renderOpponentHands() {
    getOpponentHandBackViews(GAME_STATE).forEach(({ player, tiles, isVertical }) => {
        const handBox = document.querySelector(`.player-${player} .opponent-hand`);
        if (!handBox) return;

        handBox.innerHTML = '';

        tiles.forEach(() => {
            const tileBack = document.createElement('div');
            tileBack.className = `tile-back mini-tile${isVertical ? ' vertical' : ''}`;
            handBox.appendChild(tileBack);
        });
    });
}

function updateTurnIndicators() {
    PLAYER_ORDER.forEach(player => {
        const card = document.getElementById(`avatar-${player}`);
        if (!card) return;

        const overlay = card.querySelector('.status-overlay');
        const hasWon = GAME_STATE.winners.includes(player);
        card.classList.toggle('active-turn', GAME_STATE.currentPlayer === player && !hasWon);

        if (overlay) {
            if (hasWon) {
                overlay.innerText = '已胡';
                overlay.style.backgroundColor = 'rgba(0, 255, 170, 0.8)';
                return;
            }
            overlay.innerText = GAME_STATE.currentPlayer === player ? '行动中' : '等待';
            overlay.style.backgroundColor = GAME_STATE.currentPlayer === player
                ? 'rgba(0, 243, 255, 0.8)'
                : 'rgba(11, 19, 33, 0.72)';
        }
    });
}

function updateDingQueDisplays() {
    PLAYER_ORDER.forEach(player => {
        const card = document.getElementById(`avatar-${player}`);
        if (!card) return;

        const queBox = card.querySelector('.player-que-status');
        const queBadge = card.querySelector('.avatar-que-badge');
        const chosenSuit = GAME_STATE.dingQue[player];

        if (queBox) {
            queBox.innerText = chosenSuit ? `定缺：${getQueName(chosenSuit)}` : '定缺：未选';
            queBox.className = `player-que-status font-share ${chosenSuit ? QUE_TEXT_CLASS[chosenSuit] || 'text-cyan' : 'text-dim'}`;
        }

        if (queBadge) {
            queBadge.innerText = chosenSuit ? `定缺：${getQueName(chosenSuit)}` : '定缺';
            queBadge.className = `avatar-que-badge font-share ${chosenSuit ? QUE_TEXT_CLASS[chosenSuit] || 'text-cyan' : ''}`;
        }
    });
}

function renderRealDingQueDisplays() {
    getDingQueDisplayViews(GAME_STATE).forEach(({ player, suit, hasChosen, statusText, badgeText }) => {
        const card = document.getElementById(`avatar-${player}`);
        if (!card) return;

        const queBox = card.querySelector('.player-que-status');
        const queBadge = card.querySelector('.avatar-que-badge');
        const textClass = hasChosen ? QUE_TEXT_CLASS[suit] || 'text-cyan' : 'text-dim';

        if (queBox) {
            queBox.innerText = statusText;
            queBox.className = `player-que-status font-share ${textClass}`;
        }

        if (queBadge) {
            queBadge.innerText = badgeText;
            queBadge.className = `avatar-que-badge font-share ${hasChosen ? textClass : ''}`;
        }
    });
}

function updateActionButtons() {
    const pengButton = document.querySelector('.action-btn[data-action="peng"]');
    const gangButton = document.querySelector('.action-btn[data-action="gang"]');
    const huButton = document.querySelector('.action-btn[data-action="hu"]');
    const guoButton = document.querySelector('.action-btn[data-action="guo"]');
    if (!pengButton || !gangButton || !huButton || !guoButton) return;

    const pengAvailable = canPeng(GAME_STATE, 'south');
    const gangAvailable = canGang(GAME_STATE, 'south');
    const huAvailable = canHu(GAME_STATE, 'south');
    const mustHu = mustHuInLastFourTiles(GAME_STATE, 'south');
    const showPeng = IS_WAITING_FOR_REACTION && pengAvailable;
    const showGang = gangAvailable && (IS_WAITING_FOR_REACTION || isUserTurn());
    const showHu = huAvailable && (IS_WAITING_FOR_REACTION || isUserTurn());
    const showGuo = IS_WAITING_FOR_REACTION && !mustHu;

    pengButton.hidden = !showPeng;
    pengButton.style.display = showPeng ? '' : 'none';
    pengButton.disabled = false;
    pengButton.classList.remove('is-disabled');
    pengButton.title = showPeng ? '可以碰上一张弃牌' : '当前没有可碰的牌';

    gangButton.hidden = !showGang;
    gangButton.style.display = showGang ? '' : 'none';
    gangButton.disabled = false;
    gangButton.classList.remove('is-disabled');
    gangButton.title = showGang ? '可以杠牌' : '当前没有可杠的牌';

    huButton.hidden = !showHu;
    huButton.style.display = showHu ? '' : 'none';
    huButton.disabled = false;
    huButton.classList.remove('is-disabled');
    huButton.title = showHu ? '可以胡牌' : '当前没有可胡的牌';

    guoButton.hidden = !showGuo;
    guoButton.style.display = showGuo ? '' : 'none';
    guoButton.title = mustHu ? '最后4张有胡必胡，不能跳过' : showGuo ? '跳过当前操作机会' : '';

    const targetTilePreview = document.getElementById('action-target-tile');
    const targetTileBox = document.getElementById('action-target-tile-box');
    const hasAnyAction = showPeng || showGang || showHu;

    const actionDock = document.getElementById('action-dock');
    if (actionDock) {
        const shouldShowDock = showPeng || showGang || showHu || showGuo;
        actionDock.classList.toggle('is-visible', shouldShowDock);
        actionDock.style.display = shouldShowDock ? 'flex' : 'none';
    }

    if (targetTilePreview && targetTileBox) {
        if (hasAnyAction) {
            let targetTile = null;
            if (IS_WAITING_FOR_REACTION && GAME_STATE.lastDiscard) {
                targetTile = GAME_STATE.lastDiscard.tile || GAME_STATE.lastDiscard;
            } else if (isUserTurn()) {
                targetTile = GAME_STATE.lastDrawnTile || (USER_HAND && USER_HAND.length > 0 ? USER_HAND[USER_HAND.length - 1] : null);
            }
            if (targetTile) {
                targetTileBox.innerHTML = `<div class="mahjong-tile"><div class="tile-face">${renderTileSVG(targetTile.suit, targetTile.val)}</div></div>`;
                targetTilePreview.hidden = false;
                targetTilePreview.style.display = 'flex';
            } else {
                targetTilePreview.hidden = true;
                targetTilePreview.style.display = 'none';
            }
        } else {
            targetTilePreview.hidden = true;
            targetTilePreview.style.display = 'none';
        }
    }
}

let ACTION_GUIDE_HIDE_TIMER = null;
let ACTION_GUIDE_MESSAGE = '';

function showActionGuide(message, duration = 4500) {
    if (!GAME_SETTINGS.newbieGuide) return;
    const guide = document.getElementById('action-guide');
    if (!guide) return;

    const messageChanged = ACTION_GUIDE_MESSAGE !== message;
    const wasHidden = !guide.classList.contains('is-visible');
    ACTION_GUIDE_MESSAGE = message;
    guide.innerText = message;

    if (messageChanged || wasHidden) {
        guide.classList.add('is-visible');
    }

    clearTimeout(ACTION_GUIDE_HIDE_TIMER);
    ACTION_GUIDE_HIDE_TIMER = setTimeout(() => {
        guide.classList.remove('is-visible');
        ACTION_GUIDE_MESSAGE = '';
    }, duration);
}

function hideActionGuide() {
    const guide = document.getElementById('action-guide');
    if (!guide) return;
    clearTimeout(ACTION_GUIDE_HIDE_TIMER);
    guide.classList.remove('is-visible');
    guide.innerText = '';
    ACTION_GUIDE_MESSAGE = '';
}

function updateActionGuide() {
    if (!document.getElementById('action-guide')) return;

    if (!GAME_SETTINGS.newbieGuide) {
        hideActionGuide();
        return;
    }

    if (GAME_STATE.phase === 'ding_que') {
        showActionGuide('第 1 步：选择一门定缺花色。之后必须优先打完这门牌。');
        return;
    }
    if (GAME_STATE.phase === 'round_over') {
        showActionGuide('本局已结束：可打开结算面板查看分数，再开始新一局。');
        return;
    }
    if (IS_WAITING_FOR_REACTION) {
        showActionGuide('现在可以操作：有胡优先胡；不想操作可点“过”。');
        return;
    }
    if (isUserTurn()) {
        showActionGuide('轮到你：点击一张亮起的手牌打出。带“建议打出”的牌可优先考虑。');
        return;
    }

    hideActionGuide();
}

function renderGameState() {
    USER_HAND = GAME_STATE.hands.south;
    renderUserHand();
    PLAYER_ORDER.forEach(player => renderPlayerMelds(player));
    renderOpponentHands();
    renderDiscardPiles();
    updateTilesLeft();
    updateTurnIndicators();
    renderRealDingQueDisplays();
    updateActionButtons();
    updateActionGuide();
    updateReactionCountdown();
}

function handleRoundOverIfNeeded() {
    if (GAME_STATE.phase !== 'round_over') return false;

    logTerminal(`[系统] ${getRoundEndMessage(GAME_STATE.endReason)}`);
    triggerRoundEndAlert(GAME_STATE.endReason);
    showSettlementScreen();
    renderGameState();
    return true;
}

function showSettlementScreen() {
    const setScreen = document.getElementById('settlement-screen');
    if (!setScreen || !GAME_STATE || GAME_STATE.phase !== 'round_over') return;

    renderSettlementPanel();
    setScreen.hidden = false;
    setScreen.style.display = 'flex';

    const openSetBtn = document.getElementById('open-settlement-btn');
    if (openSetBtn) openSetBtn.hidden = true;
}

function formatSettlementScore(score) {
    if (score > 0) return `+${score}`;
    return String(score);
}

function renderSettlementPanel() {
    const settlement = getRoundSettlement(GAME_STATE);
    const rankedPlayers = [...PLAYER_ORDER].sort((a, b) => {
        const scoreDiff = settlement.scoreDeltas[b] - settlement.scoreDeltas[a];
        return scoreDiff || PLAYER_ORDER.indexOf(a) - PLAYER_ORDER.indexOf(b);
    });
    const cards = document.querySelectorAll('.settlement-card');

    cards.forEach((card, index) => {
        const player = rankedPlayers[index];
        const score = settlement.scoreDeltas[player];
        const rankTag = card.querySelector('.rank-tag');
        const name = card.querySelector('.name');
        const status = card.querySelector('.status');
        const detailsBox = card.querySelector('.settlement-details-list');
        const total = card.querySelector('.total-score-box');
        if (!rankTag || !name || !status || !detailsBox || !total) return;

        card.classList.remove('rank-1', 'rank-2', 'rank-3', 'rank-4');
        card.classList.add(`rank-${index + 1}`);
        rankTag.innerText = `第${index + 1}名`;
        name.innerText = getPlayerName(player);
        status.innerText = GAME_STATE.winners.includes(player) ? '状态：已胡退场' : '状态：未胡';
        status.className = `status font-share ${GAME_STATE.winners.includes(player) ? 'text-green' : 'text-orange'}`;
        detailsBox.replaceChildren();

        const details = settlement.details[player];
        if (details.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'detail-item';
            empty.innerText = '本局暂无计分记录';
            detailsBox.appendChild(empty);
        } else {
            details.forEach(detail => {
                const row = document.createElement('div');
                const label = document.createElement('span');
                const value = document.createElement('span');
                row.className = 'detail-item';
                label.innerText = detail.name;
                if (typeof detail.fan === 'number') {
                    value.innerText = `+${detail.fan} 番`;
                    value.className = 'val text-cyan';
                } else {
                    value.innerText = `${detail.points > 0 ? '+' : ''}${detail.points} 分`;
                    value.className = `val ${detail.points >= 0 ? 'text-cyan' : 'text-magenta'}`;
                }
                row.append(label, value);
                detailsBox.appendChild(row);
            });
        }

        total.innerText = formatSettlementScore(score);
        total.classList.toggle('win', score >= 0);
        total.classList.toggle('loss', score < 0);
    });
}

function startNewRound() {
    clearUserReactionTimeout();
    GAME_STATE = createLocalRound();
    USER_HAND = GAME_STATE.hands.south;
    DING_QUE_SUIT = '';
    IS_AUTO_PLAYING = false;
    IS_WAITING_FOR_REACTION = false;
    ROUND_END_ALERT_SHOWN = false;
    const settlementScreen = document.getElementById('settlement-screen');
    if (settlementScreen) {
        settlementScreen.style.display = 'none';
        settlementScreen.hidden = true;
    }
    const openSettlementButton = document.getElementById('open-settlement-btn');
    if (openSettlementButton) openSettlementButton.hidden = true;
    const dingQueOverlay = document.getElementById('dingque-overlay');
    if (dingQueOverlay) {
        dingQueOverlay.classList.remove('is-hidden');
        dingQueOverlay.style.display = 'flex';
    }
    document.getElementById('action-dock')?.classList.remove('is-visible');
    logTerminal('[系统] 新一局已创建，请重新选择定缺花色。');
    renderGameState();
}

function logAutoReaction(reaction) {
    const playerName = getPlayerName(reaction.player);
    const tileText = reaction.result?.tile
        ? `${reaction.result.tile.val}${getQueName(reaction.result.tile.suit)}`
        : reaction.result?.tiles?.[0]
            ? `${reaction.result.tiles[0].val}${getQueName(reaction.result.tiles[0].suit)}`
            : '';

    if (reaction.action === 'hu') {
        playGameSound('hu');
        logTerminal(`[对手] ${playerName}胡了 ${tileText}。`);
        triggerHoloAlert('胡', `${playerName}胡牌成功`, 'magenta');
        testAvatarState(reaction.player, 'esc');
        return;
    }

    if (reaction.action === 'gang') {
        playGameSound('gang');
        logTerminal(`[对手] ${playerName}杠了 ${tileText}，补一张后继续出牌。`);
        triggerHoloAlert('杠', `${playerName}杠牌成功`, 'orange');
        return;
    }

    if (reaction.action === 'peng') {
        playGameSound('peng');
        logTerminal(`[对手] ${playerName}碰了 ${tileText}，接着出一张牌。`);
        return;
    }
}

function autoDiscardForCurrentOpponent(player) {
    if (handleRoundOverIfNeeded()) return;

    // 机器人摸牌或杠后补牌时，必须先判断能否自摸。
    if (canHu(GAME_STATE, player)) {
        const huResult = performHu(GAME_STATE, player);
        if (huResult) {
            logAutoReaction({
                player,
                action: 'hu',
                result: huResult
            });
        }
        renderGameState();

        if (handleRoundOverIfNeeded()) return;
        setTimeout(() => {
            runOpponentTurnsUntilUser();
        }, AUTO_PLAY_DELAYS.afterReactionBeforeContinue);
        return;
    }

    // 没有待响应弃牌时，机器人可以主动暗杠或补杠。
    // 杠后补牌，再次检查杠上花、连续杠或正常出牌。
    if (!GAME_STATE.lastDiscard && canGang(GAME_STATE, player)) {
        const gangResult = performGang(GAME_STATE, player);
        if (gangResult) {
            logAutoReaction({
                player,
                action: 'gang',
                result: gangResult
            });
        }
        renderGameState();

        if (handleRoundOverIfNeeded()) return;
        setTimeout(() => {
            autoDiscardForCurrentOpponent(player);
        }, AUTO_PLAY_DELAYS.beforeOpponentDiscard);
        return;
    }

    const discarded = autoDiscardForPlayer(GAME_STATE, player, 'advanced');
    if (discarded) {
        logTerminal(`[对手] ${getPlayerName(player)}打出：${discarded.val}${getQueName(discarded.suit)}`);
        playGameSound('discard');
    }
    renderGameState();

    setTimeout(() => {
        handleReactionAfterDiscard();
    }, AUTO_PLAY_DELAYS.afterDiscardBeforeReaction);
}

function handleReactionAfterDiscard() {
    if (handleRoundOverIfNeeded()) return;

    const reaction = chooseAutoReaction(GAME_STATE, PLAYER_ORDER);
    if (!reaction) {
        setTimeout(() => {
            runOpponentTurnsUntilUser();
        }, AUTO_PLAY_DELAYS.afterReactionBeforeContinue);
        return;
    }

    if (reaction.player === 'south') {
        IS_AUTO_PLAYING = false;
        IS_WAITING_FOR_REACTION = true;
        const discarded = GAME_STATE.lastDiscard.tile;
        const actionHint = mustHuInLastFourTiles(GAME_STATE, 'south')
            ? '最后4张有胡必胡，请点击“胡”。'
            : '请选择“胡 / 杠 / 碰 / 过”。';
        logTerminal(`[系统] 你可以操作 ${discarded.val}${getQueName(discarded.suit)}，${actionHint}`);
        renderGameState();
        startUserReactionTimeout();
        return;
    }

    const autoReaction = performAutoReaction(GAME_STATE, [reaction.player]);
    if (!autoReaction) {
        setTimeout(() => {
            runOpponentTurnsUntilUser();
        }, AUTO_PLAY_DELAYS.afterReactionBeforeContinue);
        return;
    }

    IS_AUTO_PLAYING = true;
    IS_WAITING_FOR_REACTION = false;
    clearUserReactionTimeout();
    logAutoReaction(autoReaction);
    renderGameState();

    if (handleRoundOverIfNeeded()) return;

    if (autoReaction.action === 'hu') {
        setTimeout(() => {
            runOpponentTurnsUntilUser();
        }, AUTO_PLAY_DELAYS.afterReactionBeforeContinue);
        return;
    }

    setTimeout(() => {
        autoDiscardForCurrentOpponent(autoReaction.player);
    }, AUTO_PLAY_DELAYS.beforeOpponentDiscard);
}

function runOpponentTurnsUntilUser() {
    if (handleRoundOverIfNeeded()) return;

    IS_AUTO_PLAYING = true;
    const nextTurn = advanceToNextPlayer(GAME_STATE);
    renderGameState();

    if (nextTurn.roundOver) {
        logTerminal(`[系统] ${getRoundEndMessage(nextTurn.reason)}`);
        handleRoundOverIfNeeded();
        IS_AUTO_PLAYING = false;
        return;
    }

    if (nextTurn.player === 'south') {
        logTerminal(`[操作] 轮到你摸牌：${nextTurn.drawn.val}${getQueName(nextTurn.drawn.suit)}`);
        playGameSound('draw');
        IS_AUTO_PLAYING = false;
        renderGameState();
        return;
    }

    logTerminal(`[对手] ${getPlayerName(nextTurn.player)}摸了一张牌。`);
    playGameSound('draw');

    setTimeout(() => {
        autoDiscardForCurrentOpponent(nextTurn.player);
    }, AUTO_PLAY_DELAYS.beforeOpponentDiscard);
}

function updateTilesLeft() {
    const tilesLeft = document.getElementById('tiles-left');
    if (tilesLeft) {
        tilesLeft.innerText = GAME_STATE.wall.length;
    }
}

function refreshSettingsPanel() {
    const activeTheme = getActiveTheme();
    GAME_SETTINGS = updateGameSetting(GAME_SETTINGS, 'theme', activeTheme);

    document.querySelectorAll('.settings-toggle-input').forEach(input => {
        const key = input.getAttribute('data-setting');
        input.checked = Boolean(GAME_SETTINGS[key]);
    });
    document.querySelectorAll('.settings-volume-input').forEach(input => {
        input.value = String(GAME_SETTINGS.volume);
    });
    const mobileScaleInput = document.getElementById('mobile-ui-scale-input');
    const mobileScaleValue = document.getElementById('mobile-ui-scale-value');
    if (mobileScaleInput && mobileScaleValue) {
        mobileScaleValue.value = `${mobileScaleInput.value}%`;
        mobileScaleValue.textContent = `${mobileScaleInput.value}%`;
    }

    const themeLabel = getThemeLabel(activeTheme);
    const currentThemeLabel = document.getElementById('current-theme-label');
    const themeSettingsValue = document.getElementById('theme-settings-value');

    if (currentThemeLabel) currentThemeLabel.innerText = themeLabel;
    if (themeSettingsValue) themeSettingsValue.innerText = themeLabel;
    document.body.classList.toggle('effects-reduced', !GAME_SETTINGS.effect);
    applyNewbieGuideVisibility();
    refreshBackgroundMusic();
}

function applyNewbieGuideVisibility() {
    const guide = document.getElementById('newbie-guide');
    if (guide) {
        guide.hidden = !GAME_HAS_STARTED || !GAME_SETTINGS.newbieGuide;
    }
    if (!GAME_SETTINGS.newbieGuide) {
        hideActionGuide();
    }
}

function enterGameRoom() {
    if (GAME_HAS_STARTED) return;

    GAME_STATE = createLocalRound();
    USER_HAND = GAME_STATE.hands.south;
    GAME_HAS_STARTED = true;

    const testParams = new URLSearchParams(window.location.search);
    setGangTestRound(testParams.get('gang-test'));

    const homeScreen = document.getElementById('home-screen');
    const workspace = document.getElementById('game-workspace');
    document.body.classList.remove('home-active');
    if (homeScreen) homeScreen.hidden = true;
    if (workspace) {
        workspace.hidden = false;
        workspace.setAttribute('aria-hidden', 'false');
    }

    applyNewbieGuideVisibility();
    renderGameState();
    logTerminal(`[系统] 已进入房间：108 张牌完成洗牌，四家完成发牌，牌墙剩余 ${GAME_STATE.wall.length} 张。`);

    requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        const firstAction = GAME_SETTINGS.newbieGuide
            ? document.getElementById('close-newbie-guide')
            : document.querySelector('.que-btn');
        firstAction?.focus();
    });
}

/**
 * 手机横屏使用真实可见区域计算牌桌缩放比例。
 * 牌桌始终等比缩放，优先保证整张桌面完整可见；玩家可在设置中把它缩小到 75%。
 */
function setupMobileTableScaling() {
    const scaleInput = document.getElementById('mobile-ui-scale-input');
    const scaleValue = document.getElementById('mobile-ui-scale-value');
    const storageKey = 'mahjong-mobile-table-size';
    const readPreference = () => {
        try {
            return Number(window.localStorage.getItem(storageKey)) || 100;
        } catch {
            return 100;
        }
    };

    if (scaleInput) scaleInput.value = String(Math.min(100, Math.max(75, readPreference())));

    const applyScale = () => {
        const viewport = window.visualViewport;
        const width = viewport?.width || window.innerWidth;
        const height = viewport?.height || window.innerHeight;
        const isLandscapeMobile = width <= 932 && width > height;

        if (!isLandscapeMobile) {
            document.documentElement.style.removeProperty('--mobile-table-scale');
            return;
        }

        const headerHeight = document.querySelector('.terminal-header')?.getBoundingClientRect().height || 46;
        const availableWidth = Math.max(320, width - 20);
        // 真机状态栏、圆角和 WebView 可视区域会额外占用高度，保留安全边距避免底部玩家区被裁切。
        const availableHeight = Math.max(220, height - headerHeight - 52);
        // 手机横屏使用宽屏牌桌基准，让左右可用区域成为实际操作空间。
        const automaticScale = Math.min(availableWidth / 1400, availableHeight / 640);
        const preference = (Number(scaleInput?.value) || 100) / 100;
        // 全屏横屏以牌桌为主：只留极小安全边距，避免桌框缩在屏幕中央。
        const finalScale = Math.min(automaticScale, automaticScale * preference) * 1.24;

        document.documentElement.style.setProperty('--mobile-table-scale', finalScale.toFixed(4));
        requestAnimationFrame(() => {
            const tableBounds = document.querySelector('.mahjong-table')?.getBoundingClientRect();
            if (!tableBounds) return;
            document.documentElement.style.setProperty('--mobile-board-top', `${Math.max(8, tableBounds.top + 10)}px`);
            document.documentElement.style.setProperty('--mobile-board-right', `${Math.max(8, width - tableBounds.right + 10)}px`);
        });
        if (scaleValue && scaleInput) {
            scaleValue.value = `${scaleInput.value}%`;
            scaleValue.textContent = `${scaleInput.value}%`;
        }
    };

    scaleInput?.addEventListener('input', () => {
        try {
            window.localStorage.setItem(storageKey, scaleInput.value);
        } catch {
            // 隐私模式下无法保存时，当前页面仍可正常缩放。
        }
        applyScale();
    });

    window.addEventListener('resize', applyScale);
    window.visualViewport?.addEventListener('resize', applyScale);
    applyScale();
}

function closeThemeModal() {
    const themeModal = document.getElementById('theme-modal-backdrop');
    if (themeModal) themeModal.hidden = true;
}

function setupSettingsPanel() {
    const header = document.querySelector('.terminal-header');
    const roomMenuButton = document.getElementById('open-room-menu-btn');
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const openThemeModalBtn = document.getElementById('open-theme-modal-btn');
    const closeThemeModalBtn = document.getElementById('close-theme-modal-btn');
    const themeModal = document.getElementById('theme-modal-backdrop');

    refreshSettingsPanel();

    roomMenuButton?.addEventListener('click', () => {
        const isOpen = header?.classList.toggle('room-menu-open');
        header?.classList.toggle('room-menu-collapsed', !isOpen);
        roomMenuButton.setAttribute('aria-expanded', String(Boolean(isOpen)));
    });

    openSettingsBtn?.addEventListener('click', event => {
        event.stopPropagation();
        settingsPanel.hidden = !settingsPanel.hidden;
        closeThemeModal();
        refreshSettingsPanel();
    });

    closeSettingsBtn?.addEventListener('click', () => {
        settingsPanel.hidden = true;
        closeThemeModal();
    });

    document.querySelectorAll('.settings-toggle-input').forEach(input => {
        input.addEventListener('change', () => {
            const key = input.getAttribute('data-setting');
            GAME_SETTINGS = updateGameSetting(GAME_SETTINGS, key, input.checked);
            saveGameSettings();
            document.body.classList.toggle('effects-reduced', !GAME_SETTINGS.effect);
            applyNewbieGuideVisibility();
            if (key === 'newbieGuide') {
                renderUserHand();
            }
            refreshSettingsPanel();
            refreshBackgroundMusic();
            const settingName = input.closest('label')?.querySelector('strong, .settings-toggle-text')?.textContent?.trim() || key;
            logTerminal(`[设置] ${settingName}：${input.checked ? '开启' : '关闭'}`);
        });
    });

    document.querySelectorAll('.settings-volume-input').forEach(input => {
        input.addEventListener('input', () => {
            GAME_SETTINGS = updateGameSetting(GAME_SETTINGS, 'volume', Number(input.value));
            saveGameSettings();
            refreshBackgroundMusic();
        });
    });

    openThemeModalBtn?.addEventListener('click', event => {
        event.stopPropagation();
        themeModal.hidden = false;
        refreshSettingsPanel();
    });

    closeThemeModalBtn?.addEventListener('click', closeThemeModal);

    themeModal?.addEventListener('click', event => {
        if (event.target === themeModal) closeThemeModal();
    });

    window.addEventListener('themeChanged', event => {
        const theme = event.detail?.theme || getActiveTheme();
        GAME_SETTINGS = updateGameSetting(GAME_SETTINGS, 'theme', theme);
        saveGameSettings();
        refreshSettingsPanel();
        if (GAME_STATE.stage !== 'unstarted') {
            renderGameState();
        }
        logTerminal(`[设置] 已切换主题：${getThemeLabel(theme)}`);
    });
}

// --- 鍏ㄦ伅鎻愮ず鍔ㄧ敾瑙﹀彂 ---
function triggerHoloAlert(char, subtitle, colorTheme) {
    const overlay = document.getElementById('holo-alert-screen');
    const title = document.getElementById('holo-alert-title');
    const sub = document.getElementById('holo-alert-subtitle');
    
    if (!overlay || !title || !sub) return;

    let hexColor = '#00f3ff';
    if (colorTheme === 'orange') hexColor = '#ff9900';
    if (colorTheme === 'magenta') hexColor = '#ff007f';
    if (colorTheme === 'green') hexColor = '#00ffaa';

    overlay.style.setProperty('--holo-alert-color', hexColor);
    title.innerText = char;
    title.classList.toggle('is-wide', char.length > 1);
    sub.innerText = subtitle;
    
    overlay.style.display = 'flex';
    
    logTerminal(`[事件] 触发提示：${char}（${subtitle}）`);

    setTimeout(() => {
        overlay.style.display = 'none';
    }, 2000);
}

window.testAvatarState = testAvatarState;
window.triggerHoloAlert = triggerHoloAlert;

/**
 * 创建联机房间：先连接本机的实时服务，再由服务端生成房间号。
 * 联机服务没有启动时，会保留单机游戏，不会影响现有玩法。
 */
function updateRoomLobby(room) {
    ONLINE_ROOM = room;
    localStorage.setItem(LAST_ROOM_STORAGE_KEY, room.roomNumber);
    const status = document.getElementById('room-status');
    const readyButton = document.getElementById('room-ready-btn');
    const startButton = document.getElementById('room-start-btn');
    const currentPlayer = room.players.find((player) => player.id === ONLINE_PLAYER.id);
    if (status) status.innerText = `房间号：${room.roomNumber}（${room.players.length}/4，已准备 ${room.players.filter((player) => player.ready).length} 人）`;
    if (readyButton) {
        readyButton.disabled = !currentPlayer || room.status !== 'waiting';
        readyButton.innerText = currentPlayer?.ready ? '取消准备' : '准备';
    }
    if (startButton) {
        const canStart = room.ownerId === ONLINE_PLAYER.id && room.players.length === 4 && room.players.every((player) => player.ready);
        startButton.disabled = !canStart;
        startButton.innerText = canStart ? '开始游戏' : '房主开始';
    }
    const leaveButton = document.getElementById('room-leave-btn');
    if (leaveButton) leaveButton.disabled = !currentPlayer;
}

function resetOnlineRoom(message = '单机模式') {
    ONLINE_ROOM = null;
    const status = document.getElementById('room-status');
    const readyButton = document.getElementById('room-ready-btn');
    const startButton = document.getElementById('room-start-btn');
    const leaveButton = document.getElementById('room-leave-btn');
    if (status) status.innerText = message;
    if (readyButton) { readyButton.disabled = true; readyButton.innerText = '准备'; }
    if (startButton) { startButton.disabled = true; startButton.innerText = '房主开始'; }
    if (leaveButton) leaveButton.disabled = true;
}

/**
 * 把服务端下发的牌局套用到本地界面。
 *
 * 真正的转换逻辑在 src/onlineGameState.js（纯函数、有单测），
 * 这里只负责把结果写进界面状态，避免坐错座位、别人手牌为 undefined 这两类崩溃。
 */
function applyServerGameState(room) {
    const normalized = normalizeServerGameState(room, ONLINE_PLAYER.id);
    if (!normalized) return;
    GAME_STATE = normalized.gameState;
    ONLINE_PLAYER.seat = normalized.seat;
    USER_HAND = normalized.hand;
    renderGameState();
}

function handleRoomMessage(event) {
    const message = JSON.parse(event.data);
    if (['room:created', 'room:joined', 'room:updated', 'room:reconnected'].includes(message.type)) {
        const isCurrentPlayer = message.room.players.some((player) => player.id === ONLINE_PLAYER.id);
        if (isCurrentPlayer) updateRoomLobby(message.room);
        else if (ONLINE_ROOM?.roomNumber === message.room.roomNumber) resetOnlineRoom('你已离开房间');
    }
    if (message.type === 'room:reconnected') {
        applyServerGameState(message.room);
        const status = document.getElementById('room-status');
        if (status) status.innerText = `已重新连接房间：${message.room.roomNumber}`;
        const reconnectButton = document.getElementById('room-reconnect-btn');
        if (reconnectButton) reconnectButton.disabled = false;
        logTerminal(`[联机] 已恢复房间 ${message.room.roomNumber} 的最新状态。`);
    }
    if (message.type === 'room:closed' && ONLINE_ROOM?.roomNumber === message.roomNumber) resetOnlineRoom('房间已解散');
    if (message.type === 'room:chat') logTerminal(`[聊天] ${message.chat.playerName}：${message.chat.content}`);
    if (message.type === 'room:started') {
        updateRoomLobby(message.room);
        // 牌是服务端发的，这里直接用，不再本地洗牌。
        applyServerGameState(message.room);
        const status = document.getElementById('room-status');
        if (status) status.innerText = `房间 ${message.room.roomNumber} 已开始（你是${SEAT_LABELS[ONLINE_PLAYER.seat] ?? ONLINE_PLAYER.seat}）。`;
        logTerminal(`[联机] 房间 ${message.room.roomNumber} 已开始，服务端已发牌。`);
    }
    // 出牌和碰杠胡之后服务端会推最新牌局，界面照着刷即可。
    if (message.type === 'game:discarded' || message.type === 'game:actioned') {
        applyServerGameState(message.room);
    }
    if (message.type === 'error') {
        const status = document.getElementById('room-status');
        if (status) status.innerText = message.message;
        const joinButton = document.getElementById('join-room-btn');
        if (joinButton) joinButton.disabled = false;
        logTerminal(`[联机] 操作失败：${message.message}`);
    }
}

/* ────────────────────────────────────────────────────────────────
 * 账号系统接线（BUG-002）
 *
 * 服务端的 /api/auth/*、/api/users/*、/api/leaderboard 早就写好了，
 * 但前端一个都没调过，所以玩家在 App 里既不能登录也看不到金币。
 * 下面这段就是把界面和这些接口真正接起来。
 * ──────────────────────────────────────────────────────────────── */

let CURRENT_USER = null;
let ACCOUNT_MODAL_TAB = 'records';
let ACCOUNT_CLIENT = null;
let ACCOUNT_CLIENT_BASE_URL = null;

/**
 * 取账号客户端。
 *
 * 这里必须缓存实例：令牌保存在客户端闭包里，每次 new 一个新的就等于把令牌丢了，
 * 之后所有请求都会被服务端以 401「请先登录」挡回来。
 * 只有服务器地址变了才重建，重建后把已有令牌塞回去，避免用户要重新登录一次。
 */
function getAccountClient() {
    const baseUrl = getServerHttpUrl();
    if (!ACCOUNT_CLIENT || ACCOUNT_CLIENT_BASE_URL !== baseUrl) {
        const carriedToken = ACCOUNT_CLIENT?.getToken() ?? loadToken();
        ACCOUNT_CLIENT = createAccountClient({ baseUrl });
        ACCOUNT_CLIENT_BASE_URL = baseUrl;
        if (carriedToken) ACCOUNT_CLIENT.setToken(carriedToken);
    }
    return ACCOUNT_CLIENT;
}

function setAccountMessage(text, isError = false) {
    const box = document.getElementById('account-message');
    if (!box) return;
    box.innerText = text || '';
    box.classList.toggle('is-error', Boolean(isError) && Boolean(text));
}

/** 把登录状态同步到首页面板和顶栏，两处始终显示同一份数据。 */
function renderAccount() {
    const guestView = document.getElementById('account-guest-view');
    const userView = document.getElementById('account-user-view');
    const hudName = document.getElementById('account-hud-name');
    const hudCoins = document.getElementById('account-hud-coins');

    if (guestView) guestView.hidden = Boolean(CURRENT_USER);
    if (userView) userView.hidden = !CURRENT_USER;

    if (!CURRENT_USER) {
        if (hudName) hudName.innerText = '未登录';
        if (hudCoins) hudCoins.innerText = '— 金币';
        return;
    }

    const setText = (id, value) => { const node = document.getElementById(id); if (node) node.innerText = value; };
    setText('account-name', CURRENT_USER.username);
    setText('account-coins', String(CURRENT_USER.coins ?? 0));
    setText('account-games', String(CURRENT_USER.stats?.games ?? 0));
    setText('account-wins', String(CURRENT_USER.stats?.wins ?? 0));
    const badge = document.getElementById('account-guest-badge');
    if (badge) badge.hidden = !CURRENT_USER.isGuest;
    if (hudName) hudName.innerText = CURRENT_USER.username;
    if (hudCoins) hudCoins.innerText = `${CURRENT_USER.coins ?? 0} 金币`;
}

/**
 * 登录成功后的统一处理：存会话、存令牌、刷界面，并把联机身份换成真实账号。
 * 不换的话服务端只会看到一个随机 id，金币和战绩就落不到人头上。
 *
 * 令牌必须一起落盘：它是服务端认人的唯一凭据，
 * 只存 user 而不存 token 的话，重启 App 后界面显示已登录、但所有请求都会 401。
 */
function applyLoggedInUser(user) {
    CURRENT_USER = { ...user, stats: user.stats ?? { games: 0, wins: 0 } };
    saveSession(user);
    const token = getAccountClient().getToken();
    if (token) saveToken(token);
    ONLINE_PLAYER.id = user.id;
    ONLINE_PLAYER.name = user.username;
    renderAccount();
    logTerminal(`[账号] ${user.username} 已登录，金币 ${user.coins}。`);
}

/** 从服务端拉最新资料，覆盖本地缓存里可能已经过期的金币数。 */
async function refreshAccountProfile() {
    if (!CURRENT_USER) return;
    try {
        const profile = await getAccountClient().fetchProfile(CURRENT_USER.id);
        CURRENT_USER = { ...CURRENT_USER, ...profile };
        updateSessionCoins(profile.coins);
        renderAccount();
    } catch (error) {
        // 令牌过期（30 天）或被服务端作废时，本地缓存已经没有意义：
        // 继续显示"已登录"只会让玩家点哪都失败，还不如直接退到登录界面。
        if (/请先登录|登录已失效/.test(error.message || '')) {
            forceLogout('登录已过期，请重新登录。');
            return;
        }
        // 只是网络不通就继续用本地缓存，别把玩家挡在门外。
        logTerminal(`[账号] 同步资料失败：${error.message}`);
    }
}

/** 包一层：统一按钮禁用、错误提示，避免每个入口都写一遍 try/catch。 */
async function runAccountAction(button, workingText, action) {
    const originalText = button?.innerText;
    if (button) { button.disabled = true; button.innerText = workingText; }
    setAccountMessage('');
    try {
        await action();
    } catch (error) {
        setAccountMessage(error.message, true);
        logTerminal(`[账号] ${error.message}`);
    } finally {
        if (button) { button.disabled = false; button.innerText = originalText; }
    }
}

function readCredentials() {
    const username = document.getElementById('account-username')?.value.trim() ?? '';
    const password = document.getElementById('account-password')?.value ?? '';
    return { username, password };
}

function clearPasswordField() {
    const field = document.getElementById('account-password');
    if (field) field.value = '';
}

async function handleLogin() {
    const button = document.getElementById('account-login-btn');
    await runAccountAction(button, '登录中…', async () => {
        const { username, password } = readCredentials();
        if (!username || !password) throw new Error('请先填写昵称和密码。');
        applyLoggedInUser(await getAccountClient().login(username, password));
        clearPasswordField();
        setAccountMessage(`欢迎回来，${CURRENT_USER.username}！`);
        await refreshAccountProfile();
    });
}

async function handleRegister() {
    const button = document.getElementById('account-register-btn');
    await runAccountAction(button, '注册中…', async () => {
        const { username, password } = readCredentials();
        if (!username || !password) throw new Error('请先填写昵称和密码。');
        applyLoggedInUser(await getAccountClient().register(username, password));
        clearPasswordField();
        setAccountMessage(`注册成功，赠送 ${CURRENT_USER.coins} 金币。`);
    });
}

async function handleGuestLogin() {
    const button = document.getElementById('account-guest-btn');
    await runAccountAction(button, '进入中…', async () => {
        applyLoggedInUser(await getAccountClient().loginAsGuest());
        setAccountMessage(`已作为 ${CURRENT_USER.username} 进入，金币 ${CURRENT_USER.coins}。`);
    });
}

/**
 * 就地清掉登录态（不请求服务端）。
 * 令牌已经失效的场景要用这个，因为再去调 logout 只会又吃一个 401。
 */
function forceLogout(message) {
    CURRENT_USER = null;
    clearSession();
    ACCOUNT_CLIENT?.setToken(null);
    // 退回本地随机身份，单机模式仍然能玩。
    ONLINE_PLAYER.id = `south-${createClientId()}`;
    ONLINE_PLAYER.name = '你';
    renderAccount();
    if (message) setAccountMessage(message, true);
    logTerminal(`[账号] ${message || '已退出登录。'}`);
}

async function handleLogout() {
    const name = CURRENT_USER?.username;
    // 先让服务端作废这枚令牌，否则它在 30 天内一直有效：
    // 手机丢了、令牌被人从 localStorage 抄走，就还能继续用这个账号。
    try {
        await getAccountClient().logout();
    } catch (error) {
        logTerminal(`[账号] 服务端注销失败（本地仍会退出）：${error.message}`);
    }
    forceLogout('');
    setAccountMessage(name ? `${name} 已退出登录。` : '');
    logTerminal('[账号] 已退出登录。');
}

const SEAT_LABELS = { south: '南家', east: '东家', north: '北家', west: '西家' };

function renderRecordsList(matches) {
    if (!matches.length) return '<p class="account-modal-empty">还没有战绩，先打一局吧。</p>';
    return `<ul class="account-record-list">${matches.map(match => `
        <li class="account-record-item ${match.isWinner ? 'is-win' : ''}">
            <span class="account-record-room">房间 ${match.roomNumber}</span>
            <span class="account-record-seat">${SEAT_LABELS[match.seat] ?? match.seat}</span>
            <span class="account-record-result">${match.isWinner ? '胜' : '负'}</span>
            <span class="account-record-score ${match.scoreDelta >= 0 ? 'is-gain' : 'is-loss'}">${match.scoreDelta >= 0 ? '+' : ''}${match.scoreDelta}</span>
            <span class="account-record-time">${new Date(match.finishedAt).toLocaleString()}</span>
        </li>`).join('')}</ul>`;
}

function renderLeaderboardList(entries) {
    if (!entries.length) return '<p class="account-modal-empty">排行榜还没有数据。</p>';
    return `<ul class="account-record-list">${entries.map(entry => `
        <li class="account-record-item ${entry.id === CURRENT_USER?.id ? 'is-self' : ''}">
            <span class="account-rank">第 ${entry.rank} 名</span>
            <span class="account-record-room">${entry.username}${entry.isGuest ? '（游客）' : ''}</span>
            <span class="account-record-score is-gain">${entry.coins} 金币</span>
            <span class="account-record-time">${entry.stats.games} 局 / ${entry.stats.wins} 胜</span>
        </li>`).join('')}</ul>`;
}

async function openAccountModal(tab = 'records') {
    ACCOUNT_MODAL_TAB = tab;
    const backdrop = document.getElementById('account-modal-backdrop');
    const body = document.getElementById('account-modal-body');
    const title = document.getElementById('account-modal-title');
    if (!backdrop || !body) return;

    backdrop.hidden = false;
    document.querySelectorAll('[data-account-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.accountTab === tab);
    });
    if (title) title.innerText = tab === 'records' ? '我的战绩' : '排行榜';
    body.innerHTML = '<p class="account-modal-empty">加载中…</p>';

    try {
        const client = getAccountClient();
        if (tab === 'records') {
            if (!CURRENT_USER) throw new Error('请先登录再查看战绩。');
            body.innerHTML = renderRecordsList(await client.fetchMatches(CURRENT_USER.id));
        } else {
            body.innerHTML = renderLeaderboardList(await client.fetchLeaderboard());
        }
    } catch (error) {
        body.innerHTML = `<p class="account-modal-empty is-error">${error.message}</p>`;
    }
}

function closeAccountModal() {
    const backdrop = document.getElementById('account-modal-backdrop');
    if (backdrop) backdrop.hidden = true;
}

/** 设置面板里的服务器地址：显示当前生效值，并允许手动覆盖。 */
function refreshServerOriginRow() {
    const input = document.getElementById('server-origin-input');
    const hint = document.getElementById('server-origin-hint');
    const report = describeServerConfig();
    if (input && document.activeElement !== input) input.value = report.origin ?? '';
    if (hint) {
        hint.innerText = report.ok
            ? `当前生效：${report.origin}（实时地址 ${report.wsUrl}）`
            : `未配置：${report.error}`;
        hint.classList.toggle('is-error', !report.ok);
    }
}

function setupAccountUi() {
    document.getElementById('account-login-btn')?.addEventListener('click', handleLogin);
    document.getElementById('account-register-btn')?.addEventListener('click', handleRegister);
    document.getElementById('account-guest-btn')?.addEventListener('click', handleGuestLogin);
    document.getElementById('account-logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('account-records-btn')?.addEventListener('click', () => openAccountModal('records'));
    document.getElementById('account-leaderboard-btn')?.addEventListener('click', () => openAccountModal('leaderboard'));
    document.getElementById('account-hud')?.addEventListener('click', () => openAccountModal(CURRENT_USER ? 'records' : 'leaderboard'));
    document.getElementById('account-modal-close-btn')?.addEventListener('click', closeAccountModal);
    document.getElementById('account-modal-backdrop')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeAccountModal();
    });
    document.querySelectorAll('[data-account-tab]').forEach(button => {
        button.addEventListener('click', () => openAccountModal(button.dataset.accountTab));
    });
    // 在密码框按回车直接登录，手机上少点一次。
    document.getElementById('account-password')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') handleLogin();
    });

    document.getElementById('server-origin-save-btn')?.addEventListener('click', () => {
        const input = document.getElementById('server-origin-input');
        try {
            setServerOriginOverride(input?.value ?? '');
            refreshServerOriginRow();
            logTerminal('[联机] 服务器地址已更新，请重新创建或加入房间。');
        } catch (error) {
            const hint = document.getElementById('server-origin-hint');
            if (hint) { hint.innerText = error.message; hint.classList.add('is-error'); }
        }
    });
    document.getElementById('server-origin-reset-btn')?.addEventListener('click', () => {
        setServerOriginOverride('');
        refreshServerOriginRow();
    });

    // 打开页面时恢复上次的登录态，玩家不用每次重新登录。
    // 恢复顺序有讲究：先把令牌塞回客户端，再去拉资料，
    // 否则第一个请求就是匿名的，会被服务端 401 顶回来。
    CURRENT_USER = loadSession();
    const savedToken = loadToken();
    if (savedToken) {
        try {
            getAccountClient().setToken(savedToken);
        } catch (error) {
            // 服务器地址还没配好时 getAccountClient 会抛错，这不该拦住整个界面初始化。
            logTerminal(`[账号] 暂时无法恢复登录令牌：${error.message}`);
        }
    }
    if (CURRENT_USER && !savedToken) {
        // 有用户缓存但没有令牌（旧版本升级上来的存档）：这种登录态是假的，
        // 任何联机操作都会失败，直接清掉并提示重新登录，比让玩家一头雾水好。
        forceLogout('登录方式已升级，请重新登录一次。');
    } else if (CURRENT_USER) {
        ONLINE_PLAYER.id = CURRENT_USER.id;
        ONLINE_PLAYER.name = CURRENT_USER.username;
    }
    renderAccount();
    refreshServerOriginRow();
    if (CURRENT_USER) refreshAccountProfile();
}

/**
 * 建立到房间服务器的实时连接。
 *
 * 以前每个入口（创建/加入/重连）都各写一遍 `ws://${location.hostname}:3001/ws`，
 * 在安装包里会算成“连手机自己”，三处一起错。现在统一走 src/config.js，
 * 地址只有一个来源，出错也只需要改一个地方。
 *
 * @returns {WebSocket|null} 地址没配好时返回 null，并且已经把原因写到界面上了。
 */
function openRoomSocket(statusElement, onFailure) {
    let url;
    try {
        url = getServerWsUrl();
    } catch (error) {
        // 地址没配好属于“配置问题”，不是“服务器没开”，要分清楚，否则又要靠真机才能发现。
        if (statusElement) statusElement.innerText = '服务器地址未配置';
        logTerminal(`[联机] ${error.message}`);
        onFailure?.();
        return null;
    }

    ROOM_SOCKET?.close();
    ROOM_SOCKET = new WebSocket(url);
    logTerminal(`[联机] 正在连接 ${url}`);
    return ROOM_SOCKET;
}

/**
 * 连上之后先鉴权，鉴权通过再执行房间动作。
 *
 * 服务端现在要求实时连接的第一条消息是 auth：把令牌换成它认定的真实 userId，
 * 之后 create/join 里客户端自称的 player.id 一律被忽略。
 * 所以这里不能像以前那样在 open 事件里直接发 room:create——那会被拒。
 *
 * @param {() => void} sendAction 鉴权成功后要发的房间动作
 * @returns {boolean} 未登录时返回 false，并已把原因写到界面上
 */
function authenticateThenSend(socket, statusElement, sendAction, onFailure) {
    const token = ACCOUNT_CLIENT?.getToken() ?? loadToken();
    if (!token) {
        // 联机必须先有账号：否则战绩和金币记不到人头上，服务端也无法判断谁在操作。
        if (statusElement) statusElement.innerText = '请先登录再联机';
        logTerminal('[联机] 未登录，无法进入房间。请先在首页登录或以游客身份进入。');
        setAccountMessage('联机需要先登录，可以点“游客试玩”快速进入。', true);
        socket.close();
        onFailure?.();
        return false;
    }

    let authed = false;
    socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'auth', token }));
    });
    socket.addEventListener('message', (event) => {
        if (authed) return;
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return;
        }
        if (message.type === 'authenticated') {
            authed = true;
            sendAction();
            return;
        }
        // 令牌过期时服务端回 error，这时要清掉假的登录态，不然玩家会一直重试。
        if (message.type === 'error' && /请先登录|登录已失效/.test(message.message || '')) {
            forceLogout('登录已过期，请重新登录。');
            if (statusElement) statusElement.innerText = '登录已过期';
            socket.close();
            onFailure?.();
        }
    });
    return true;
}

/** 连接失败时的统一提示：把真实地址一起打出来，方便一眼看出是不是连错了机器。 */
function reportSocketFailure(statusElement, onFailure) {
    const report = describeServerConfig();
    if (statusElement) statusElement.innerText = '房间服务器未连上';
    logTerminal(`[联机] 连接失败：${report.wsUrl || '地址未配置'}。请确认服务端已运行（npm run server），且手机与电脑在同一网络。`);
    onFailure?.();
}

function sendQuickChat(text) {
    if (!ROOM_SOCKET || !ONLINE_ROOM) {
        logTerminal('[聊天] 请先加入联机房间。');
        return;
    }
    ROOM_SOCKET.send(JSON.stringify({ type: 'room:chat', roomNumber: ONLINE_ROOM.roomNumber, text }));
}

function createOnlineRoom() {
    const status = document.getElementById('room-status');
    const createButton = document.getElementById('create-room-btn');
    if (!status || !createButton) return;

    createButton.disabled = true;
    status.innerText = '正在连接房间服务器…';

    if (!openRoomSocket(status, () => { createButton.disabled = false; })) return;

    // 先 auth 再 room:create，顺序反了服务端会以「请先登录」拒绝。
    if (!authenticateThenSend(
        ROOM_SOCKET,
        status,
        () => ROOM_SOCKET.send(JSON.stringify({ type: 'room:create', player: { name: ONLINE_PLAYER.name } })),
        () => { createButton.disabled = false; }
    )) return;

    ROOM_SOCKET.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        handleRoomMessage(event);
        if (message.type !== 'room:created') return;
        createButton.innerText = '房间已创建';
        logTerminal(`[联机] 房间 ${message.room.roomNumber} 已创建，你是房主。`);
    });

    ROOM_SOCKET.addEventListener('error', () => {
        reportSocketFailure(status, () => { createButton.disabled = false; });
    });
}

/**
 * 加入已有房间：房间号必须是六位数字，避免把输入错误也发给服务器。
 */
function joinOnlineRoom() {
    const status = document.getElementById('room-status');
    const input = document.getElementById('room-number-input');
    const joinButton = document.getElementById('join-room-btn');
    if (!status || !input || !joinButton) return;

    const roomNumber = input.value.trim();
    if (!/^\d{6}$/.test(roomNumber)) {
        status.innerText = '请输入六位房间号';
        input.focus();
        return;
    }

    joinButton.disabled = true;
    status.innerText = '正在加入房间…';
    if (!openRoomSocket(status, () => { joinButton.disabled = false; })) return;

    if (!authenticateThenSend(
        ROOM_SOCKET,
        status,
        () => ROOM_SOCKET.send(JSON.stringify({ type: 'room:join', roomNumber, player: { name: ONLINE_PLAYER.name } })),
        () => { joinButton.disabled = false; }
    )) return;

    ROOM_SOCKET.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        handleRoomMessage(event);
        if (message.type === 'room:updated') {
            joinButton.innerText = '已加入';
            logTerminal(`[联机] 已加入房间 ${message.room.roomNumber}，当前 ${message.room.players.length}/4 人。`);
        }
    });

    ROOM_SOCKET.addEventListener('error', () => {
        reportSocketFailure(status, () => { joinButton.disabled = false; });
    });
}

function setRoomReady() {
    if (!ROOM_SOCKET || !ONLINE_ROOM) return;
    const currentPlayer = ONLINE_ROOM.players.find((player) => player.id === ONLINE_PLAYER.id);
    // 不再上报 playerId：服务端用连接上鉴权得到的身份，客户端说自己是谁没用。
    ROOM_SOCKET.send(JSON.stringify({
        type: 'room:ready', roomNumber: ONLINE_ROOM.roomNumber, ready: !currentPlayer?.ready
    }));
}

function startOnlineRoom() {
    if (!ROOM_SOCKET || !ONLINE_ROOM) return;
    // 不再上传 gameState：牌由服务端洗、由服务端发，
    // 否则房主可以自己造一副好牌再让服务端照单全收。
    ROOM_SOCKET.send(JSON.stringify({ type: 'room:start', roomNumber: ONLINE_ROOM.roomNumber }));
}

function leaveOnlineRoom() {
    if (!ROOM_SOCKET || !ONLINE_ROOM) return;
    const roomNumber = ONLINE_ROOM.roomNumber;
    ROOM_SOCKET.send(JSON.stringify({ type: 'room:leave', roomNumber }));
    resetOnlineRoom('正在离开房间…');
    ROOM_SOCKET.close();
    ROOM_SOCKET = null;
    localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
    logTerminal(`[联机] 已离开房间 ${roomNumber}。`);
}

function reconnectOnlineRoom() {
    const roomNumber = localStorage.getItem(LAST_ROOM_STORAGE_KEY);
    const status = document.getElementById('room-status');
    const reconnectButton = document.getElementById('room-reconnect-btn');
    if (!roomNumber) {
        if (status) status.innerText = '没有可恢复的房间';
        return;
    }

    if (reconnectButton) reconnectButton.disabled = true;
    if (status) status.innerText = '正在恢复房间…';
    const enableReconnectButton = () => { if (reconnectButton) reconnectButton.disabled = false; };
    if (!openRoomSocket(status, enableReconnectButton)) return;

    if (!authenticateThenSend(
        ROOM_SOCKET,
        status,
        () => ROOM_SOCKET.send(JSON.stringify({ type: 'room:reconnect', roomNumber })),
        enableReconnectButton
    )) return;
    ROOM_SOCKET.addEventListener('message', handleRoomMessage);
    ROOM_SOCKET.addEventListener('error', () => reportSocketFailure(status, enableReconnectButton));
}

function bootstrapApp() {
    initTheme();
    setupSettingsPanel();
    setupMobileTableScaling();
    setupAccountUi();
    document.getElementById('create-room-btn')?.addEventListener('click', createOnlineRoom);
    document.getElementById('join-room-btn')?.addEventListener('click', joinOnlineRoom);
    document.getElementById('room-ready-btn')?.addEventListener('click', setRoomReady);
    document.getElementById('room-start-btn')?.addEventListener('click', startOnlineRoom);
    document.getElementById('room-leave-btn')?.addEventListener('click', leaveOnlineRoom);
    document.getElementById('room-reconnect-btn')?.addEventListener('click', reconnectOnlineRoom);
    document.querySelectorAll('[data-chat]').forEach(button => button.addEventListener('click', () => sendQuickChat(button.dataset.chat)));

    setInterval(() => {
        const timeBox = document.getElementById('system-time');
        if (timeBox) {
            timeBox.innerText = new Date().toLocaleTimeString();
        }
    }, 1000);

    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const contentId = tab.getAttribute('data-tab');
            const contents = document.querySelectorAll('.showroom-tab-content');
            contents.forEach(c => c.classList.remove('active'));
            
            const targetContent = document.getElementById(contentId);
            if (targetContent) targetContent.classList.add('active');
        });
    });

    const playerCards = document.querySelectorAll('.player-info-card');
    playerCards.forEach(card => {
        card.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = card.classList.contains('is-open');
            playerCards.forEach(item => item.classList.remove('is-open'));
            if (!isOpen) {
                card.classList.add('is-open');
            }
        });

        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            card.click();
        });
    });

    document.addEventListener('click', () => {
        playerCards.forEach(card => card.classList.remove('is-open'));
    });

    const queButtons = document.querySelectorAll('.que-btn');
    const dingQuePanel = document.getElementById('dingque-overlay');
    const userQueDisplay = document.getElementById('user-que-display');
    document.getElementById('close-newbie-guide')?.addEventListener('click', () => {
        GAME_SETTINGS = updateGameSetting(GAME_SETTINGS, 'newbieGuide', false);
        saveGameSettings();
        refreshSettingsPanel();
        applyNewbieGuideVisibility();
        renderUserHand();
    });
    document.getElementById('enter-room-btn')?.addEventListener('click', enterGameRoom);

    queButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const chosen = btn.getAttribute('data-que');
            DING_QUE_SUIT = chosen;
            GAME_STATE.dingQue.south = chosen;
            assignOpponentDingQue();
            GAME_STATE.phase = 'playing';

            // 手机横屏样式含有全屏覆盖层，使用专用状态确保定缺完成后一定释放牌桌。
            dingQuePanel.classList.add('is-hidden');
            dingQuePanel.style.display = 'none';
            const actionDock = document.getElementById('action-dock');
            if (actionDock) {
                actionDock.classList.add('is-visible');
            }

            logTerminal(`[定缺] 你选择定缺：${getQueName(chosen)}`);
            if (userQueDisplay) {
                userQueDisplay.innerText = `定缺：${getQueName(chosen)}`;
                userQueDisplay.className = `player-que-status font-share text-magenta`;
            }

            renderGameState();
        });
    });

// 5. 閲忓瓙楠板瓙婊氬姩
    const diceTrigger = document.getElementById('dice-trigger');
    const d1 = document.getElementById('dice-val-1');
    const d2 = document.getElementById('dice-val-2');
    let rolling = false;

    if (diceTrigger) {
        diceTrigger.addEventListener('click', () => {
            if (rolling) return;
            rolling = true;
            logTerminal(`[系统] 正在掷骰决定行动方位……`);
            
            let count = 0;
            const interval = setInterval(() => {
                d1.innerText = Math.floor(Math.random() * 6) + 1;
                d2.innerText = Math.floor(Math.random() * 6) + 1;
                count++;
                if (count > 10) {
                    clearInterval(interval);
                    rolling = false;
                    const final1 = Math.floor(Math.random() * 6) + 1;
                    const final2 = Math.floor(Math.random() * 6) + 1;
                    d1.innerText = final1;
                    d2.innerText = final2;
                    logTerminal(`[系统] 骰子已停止，点数合计：${final1 + final2}。行动玩家：南家。`);
                }
            }, 80);
        });
    }

    const openSetBtn = document.getElementById('open-settlement-btn');
    const closeSetBtn = document.getElementById('close-settlement-btn');
    const setScreen = document.getElementById('settlement-screen');

    if (openSetBtn && setScreen) {
        openSetBtn.addEventListener('click', () => {
            renderSettlementPanel();
            setScreen.hidden = false;
            setScreen.style.display = 'flex';
            logTerminal(`[系统] 正在打开终局结算面板……`);
            tickSettlementScores();
        });
    }

    if (closeSetBtn && setScreen) {
        closeSetBtn.addEventListener('click', () => {
            setScreen.style.display = 'none';
            setScreen.hidden = true;
            if (openSetBtn) openSetBtn.hidden = false;
        });
    }

    document.getElementById('next-round-btn')?.addEventListener('click', startNewRound);
    document.getElementById('restart-round-btn')?.addEventListener('click', startNewRound);

// 7. 鎿嶄綔鎸夐挳鐐瑰嚮鎻愮ず
    const actionButtons = document.querySelectorAll('.action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            if (action === 'peng') {
                if (!IS_WAITING_FOR_REACTION || !canPeng(GAME_STATE, 'south')) {
                    logTerminal(`[系统] 当前没有可碰的牌。`);
                    return;
                }
                const meld = performPeng(GAME_STATE, 'south');
                if (!meld) {
                    logTerminal(`[系统] 碰牌失败，请重新选择。`);
                    renderGameState();
                    return;
                }

                clearUserReactionTimeout();
                IS_WAITING_FOR_REACTION = false;
                IS_AUTO_PLAYING = false;
                USER_HAND = GAME_STATE.hands.south;
                triggerHoloAlert('碰', '碰牌成功，请出一张牌', 'cyan');
                playGameSound('peng');
                logTerminal(`[操作] 你碰了 ${meld.tiles[0].val}${getQueName(meld.tiles[0].suit)}，现在请从手牌中打一张牌。`);
                renderGameState();
            } else if (action === 'gang') {
                if (!canGang(GAME_STATE, 'south')) {
                    logTerminal(`[系统] 当前没有可杠的牌。`);
                    renderGameState();
                    return;
                }

                const meld = performGang(GAME_STATE, 'south');
                if (!meld) {
                    logTerminal(`[系统] 杠牌失败，请重新选择。`);
                    renderGameState();
                    return;
                }

                clearUserReactionTimeout();
                IS_WAITING_FOR_REACTION = false;
                IS_AUTO_PLAYING = false;
                USER_HAND = GAME_STATE.hands.south;
                triggerHoloAlert('杠', '杠牌成功，已补一张牌', 'orange');
                playGameSound('gang');
                logTerminal(`[操作] 你杠了 ${meld.tiles[0].val}${getQueName(meld.tiles[0].suit)}，系统已为你补一张牌。`);
                renderGameState();
                return;
            } else if (action === 'hu') {
                if (!canHu(GAME_STATE, 'south')) {
                    logTerminal(`[系统] 当前没有可胡的牌。`);
                    renderGameState();
                    return;
                }

                const result = performHu(GAME_STATE, 'south');
                if (!result) {
                    logTerminal(`[系统] 胡牌失败，请重新选择。`);
                    renderGameState();
                    return;
                }

                clearUserReactionTimeout();
                IS_WAITING_FOR_REACTION = false;
                IS_AUTO_PLAYING = false;
                triggerHoloAlert('胡', '胡牌成功', 'magenta');
                playGameSound('hu');
                logTerminal(`[操作] 你胡了 ${result.tile.val}${getQueName(result.tile.suit)}。`);
                testAvatarState('south', 'esc');
                renderGameState();
                continueAfterUserHu();
                return;
            } else if (action === 'guo') {
                if (IS_WAITING_FOR_REACTION) {
                    if (mustHuInLastFourTiles(GAME_STATE, 'south')) {
                        logTerminal(`[规则] 最后4张有胡必胡，不能选择“过”。`);
                        triggerHoloAlert('胡', '最后4张有胡必胡', 'magenta');
                        renderGameState();
                        return;
                    }

                    clearUserReactionTimeout();
                    IS_WAITING_FOR_REACTION = false;
                    logTerminal(`[操作] 你选择跳过当前操作机会。`);
                    renderGameState();
                    setTimeout(() => {
                        runOpponentTurnsUntilUser();
                    }, AUTO_PLAY_DELAYS.afterUserPass);
                    return;
                }
                logTerminal(`[操作] 你选择跳过当前操作。`);
            }
        });
    });

    initAvatars();
    populateShowroom();
    refreshSettingsPanel();
    document.getElementById('enter-room-btn')?.focus();

    window.GAME_STATE = GAME_STATE;
    window.renderGameState = renderGameState;
    window.showSettlementScreen = showSettlementScreen;
    window.enterGameRoom = enterGameRoom;
    Object.defineProperty(window, 'IS_WAITING_FOR_REACTION', {
        get: () => IS_WAITING_FOR_REACTION,
        set: val => { IS_WAITING_FOR_REACTION = val; }
    });
    Object.defineProperty(window, 'GAME_STATE', {
        get: () => GAME_STATE,
        set: val => { GAME_STATE = val; }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
    bootstrapApp();
}

function tickSettlementScores() {
    const scores = document.querySelectorAll('.total-score-box');
    scores.forEach(box => {
        const finalVal = parseInt(box.innerText.replace(/,/g, ''), 10);
        let current = 0;
        const duration = 1200;
        const steps = 30;
        const valStep = Math.round(finalVal / steps);
        let stepCount = 0;

        const timer = setInterval(() => {
            current += valStep;
            stepCount++;
            box.innerText = current.toLocaleString();
            
            if (stepCount >= steps) {
                clearInterval(timer);
                box.innerText = (finalVal > 0 ? '+' : '') + finalVal.toLocaleString() + ' 分';
            }
        }, duration / steps);
    });
}


