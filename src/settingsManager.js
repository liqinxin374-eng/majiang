import { COMPONENT_OPTIONS } from './themes/themeCatalog.js';

export const DEFAULT_GAME_SETTINGS = {
    sound: true,
    music: false,
    volume: 0.35,
    effect: true,
    vibration: true,
    newbieGuide: true,
    theme: 'sci-fi'
};

export const AUTO_PLAY_DELAYS = {
    afterUserPass: 220,
    afterDiscardBeforeReaction: 280,
    afterReactionBeforeContinue: 320,
    beforeOpponentDiscard: 360,
    noDiscardContinue: 240
};

export const THEME_OPTIONS = [
    { id: 'sci-fi', label: '科幻风格', icon: '◈' },
    { id: 'classic', label: '国风风格', icon: '◆' },
    { id: 'xianxia', label: '仙侠风格', icon: '✦' }
];

export { COMPONENT_OPTIONS };

export function getThemeLabel(themeId) {
    return THEME_OPTIONS.find(theme => theme.id === themeId)?.label || THEME_OPTIONS[0].label;
}

export function updateGameSetting(settings, key, value) {
    return { ...settings, [key]: value };
}
