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
    setTheme(savedTheme, { resetComponents: false });
    applyComponentThemes();
    setupThemeListeners();
}

export function setTheme(themeName, { resetComponents = false } = {}) {
    if (!THEME_CONFIG[themeName]) return;

    Object.values(THEME_CONFIG).forEach(config => document.body.classList.remove(config.class));
    document.body.classList.add(THEME_CONFIG[themeName].class);
    localStorage.setItem(THEME_KEY, themeName);

    if (resetComponents) {
        applyComponentThemes(THEME_CATALOG[themeName].components);
        localStorage.setItem(COMPONENT_THEME_KEY, JSON.stringify(THEME_CATALOG[themeName].components));
    }

    updateToggleButtons(themeName);
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: themeName } }));
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
    const container = document.getElementById('theme-switcher-container');
    container?.addEventListener('click', event => {
        const button = event.target.closest('.theme-toggle-btn');
        if (!button) return;
        setTheme(button.getAttribute('data-theme'), { resetComponents: true });
    });
}
