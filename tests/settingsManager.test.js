import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_GAME_SETTINGS,
    AUTO_PLAY_DELAYS,
    THEME_OPTIONS,
    getThemeLabel,
    updateGameSetting
} from '../src/settingsManager.js';

test('default game settings keep sound effects vibration on and sci-fi theme active', () => {
    assert.deepEqual(DEFAULT_GAME_SETTINGS, {
        sound: true,
        music: false,
        volume: 0.35,
        effect: true,
        vibration: true,
        newbieGuide: true,
        theme: 'sci-fi'
    });
});

test('getThemeLabel returns readable Chinese theme names', () => {
    assert.equal(getThemeLabel('sci-fi'), '科幻风格');
    assert.equal(getThemeLabel('classic'), '国风风格');
    assert.equal(getThemeLabel('unknown'), '科幻风格');
});

test('updateGameSetting updates one setting without changing the others', () => {
    const nextSettings = updateGameSetting(DEFAULT_GAME_SETTINGS, 'sound', false);

    assert.equal(nextSettings.sound, false);
    assert.equal(nextSettings.effect, true);
    assert.equal(nextSettings.vibration, true);
    assert.equal(nextSettings.newbieGuide, true);
    assert.equal(nextSettings.theme, 'sci-fi');
});

test('theme options include sci-fi as the current default option', () => {
    assert.equal(THEME_OPTIONS[0].id, 'sci-fi');
    assert.equal(THEME_OPTIONS[0].label, '科幻风格');
});

test('auto play delays keep computer actions from happening instantly', () => {
    assert.deepEqual(AUTO_PLAY_DELAYS, {
        afterUserPass: 220,
        afterDiscardBeforeReaction: 280,
        afterReactionBeforeContinue: 320,
        beforeOpponentDiscard: 360,
        noDiscardContinue: 240
    });

    Object.values(AUTO_PLAY_DELAYS).forEach(delay => {
        assert.equal(Number.isInteger(delay), true);
        assert.equal(delay > 0, true);
    });
});
