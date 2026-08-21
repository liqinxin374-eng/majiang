import {
    COMPONENT_OPTIONS,
    DEFAULT_COMPONENT_SETTINGS,
    THEME_CATALOG
} from './themes/themeCatalog.js';

const THEME_KEY = 'mahjong_theme';
const COMPONENT_THEME_KEY = 'mahjong_component_themes';
const DEFAULT_THEME = 'sci-fi';

export const THEME_CONFIG = Object.fromEntries(
    Object.entries(THEME_CATALOG).map(([id, config]) => [id, {
        name: config.name,
        class: config.className,
        icon: config.icon
    }])
);

function validComponentSettings(settings) {
    return Object.fromEntries(Object.keys(DEFAULT_COMPONENT_SETTINGS).map(type => {
        const requested = settings?.[type];
        const valid = COMPONENT_OPTIONS[type]?.some(option => option.id === requested);
        return [type, valid ? requested : DEFAULT_COMPONENT_SETTINGS[type]];
    }));
}

export function getComponentThemes() {
    try {
        return validComponentSettings(JSON.parse(localStorage.getItem(COMPONENT_THEME_KEY) || '{}'));
    } catch {
        return { ...DEFAULT_COMPONENT_SETTINGS };
    }
}

function applyComponentClasses(settings) {
    Object.keys(DEFAULT_COMPONENT_SETTINGS).forEach(type => {
        COMPONENT_OPTIONS[type].forEach(option => document.body.classList.remove(`theme-${type}-${option.id}`));
        document.body.classList.add(`theme-${type}-${settings[type]}`);
    });
}

export function setComponentTheme(type, themeName) {
    const next = validComponentSettings({ ...getComponentThemes(), [type]: themeName });
    applyComponentClasses(next);
    localStorage.setItem(COMPONENT_THEME_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('componentThemeChanged', { detail: { type, themes: next } }));
}

export function applyComponentThemes(settings = getComponentThemes()) {
    const next = validComponentSettings(settings);
    applyComponentClasses(next);
    return next;
}

export function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
    console.log('[ThemeManager] initTheme with:', savedTheme);
    setTheme(savedTheme);
    setupThemeListeners();
}

export function setTheme(themeName) {
    console.log('[ThemeManager] setTheme called with:', themeName);
    const validTheme = THEME_CONFIG[themeName] ? themeName : DEFAULT_THEME;

    // 1. 清理所有历史主题相关类名
    const allThemeKeys = Object.keys(THEME_CATALOG);
    allThemeKeys.forEach(key => {
        document.body.classList.remove(`theme-${key}`);
        document.body.classList.remove(`theme-background-${key}`);
        document.body.classList.remove(`theme-tile-${key}`);
        document.body.classList.remove(`theme-table-${key}`);
    });

    // 2. 整体添加当前选定主题的全部核心类名
    document.body.classList.add(`theme-${validTheme}`);
    document.body.classList.add(`theme-background-${validTheme}`);
    document.body.classList.add(`theme-tile-${validTheme}`);
    document.body.classList.add(`theme-table-${validTheme}`);

    // 3. 持久化存储主题状态
    try {
        localStorage.setItem(THEME_KEY, validTheme);
        localStorage.setItem(COMPONENT_THEME_KEY, JSON.stringify({
            tile: validTheme,
            background: validTheme,
            table: validTheme
        }));
    } catch {}

    // 4. 更新弹窗按钮选中态与全局事件派发
    updateToggleButtons(validTheme);
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: validTheme } }));
}

export function getActiveTheme() {
    return localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
}

function updateToggleButtons(activeTheme) {
    document.querySelectorAll('.theme-toggle-btn').forEach(button => {
        button.classList.toggle('active', button.getAttribute('data-theme') === activeTheme);
    });
}

function setupThemeListeners() {
    document.addEventListener('click', event => {
        const button = event.target.closest('.theme-toggle-btn');
        if (!button) return;
        const targetTheme = button.getAttribute('data-theme');
        if (targetTheme) {
            setTheme(targetTheme);
        }
    });
}
