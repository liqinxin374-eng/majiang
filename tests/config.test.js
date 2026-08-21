import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_SERVER_PORT,
    SERVER_ORIGIN_STORAGE_KEY,
    describeServerConfig,
    getServerWsUrl,
    isPackagedRuntime,
    normalizeOrigin,
    resolveServerOrigin,
    setServerOriginOverride,
    toWebSocketUrl
} from '../src/config.js';

/**
 * BUG-001 的回归测试。
 *
 * 核心要守住的一条：安装包里不能再用页面地址去猜后端在哪。
 * 猜出来的永远是 localhost，也就是手机自己，必然连不上。
 */

/** 假的 localStorage，够用就行。 */
const createStorage = (initial = {}) => {
    const data = new Map(Object.entries(initial));
    return {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key),
        get size() { return data.size; }
    };
};

const browserContext = (overrides = {}) => ({
    globalScope: {},
    storage: createStorage(),
    location: { protocol: 'http:', hostname: '192.168.1.20' },
    buildEnv: {},
    ...overrides
});

/** 模拟 Android 安装包：Capacitor 全局存在，页面来源是 https://localhost。 */
const packagedContext = (overrides = {}) => ({
    globalScope: { Capacitor: { isNativePlatform: () => true } },
    storage: createStorage(),
    location: { protocol: 'https:', hostname: 'localhost' },
    buildEnv: {},
    ...overrides
});

test('packaged app without any configuration fails loudly instead of connecting to itself', () => {
    // 这就是 BUG-001 的原始场景：旧代码会算出 wss://localhost:3001/ws（手机连自己）。
    // 现在必须直接报错，而且错误里要说清楚该配什么。
    assert.throws(() => resolveServerOrigin(packagedContext()), /未配置服务器地址/);
    assert.throws(() => resolveServerOrigin(packagedContext()), /VITE_SERVER_ORIGIN/);
});

test('packaged app never derives the address from the page location', () => {
    const context = packagedContext();
    const report = describeServerConfig(context);
    assert.equal(report.packaged, true);
    assert.equal(report.ok, false);
    assert.equal(report.wsUrl, null, '安装包里绝不能出现由 location 推导出来的地址');
});

test('build-time VITE_SERVER_ORIGIN is used by the packaged app', () => {
    const context = packagedContext({ buildEnv: { VITE_SERVER_ORIGIN: 'http://192.168.1.10:3001' } });
    assert.equal(resolveServerOrigin(context), 'http://192.168.1.10:3001');
    assert.equal(getServerWsUrl(context), 'ws://192.168.1.10:3001/ws');
});

test('deployment-time global override beats the build-time value', () => {
    const context = packagedContext({
        globalScope: { Capacitor: {}, __MAHJONG_SERVER_ORIGIN__: 'https://mahjong.example.com' },
        buildEnv: { VITE_SERVER_ORIGIN: 'http://192.168.1.10:3001' }
    });
    assert.equal(resolveServerOrigin(context), 'https://mahjong.example.com');
    assert.equal(getServerWsUrl(context), 'wss://mahjong.example.com/ws');
});

test('runtime localStorage override beats every other source', () => {
    const context = packagedContext({
        globalScope: { Capacitor: {}, __MAHJONG_SERVER_ORIGIN__: 'https://mahjong.example.com' },
        storage: createStorage({ [SERVER_ORIGIN_STORAGE_KEY]: 'http://10.0.0.7:3001' }),
        buildEnv: { VITE_SERVER_ORIGIN: 'http://192.168.1.10:3001' }
    });
    assert.equal(resolveServerOrigin(context), 'http://10.0.0.7:3001');
});

test('plain browser still derives a convenient default for local development', () => {
    const context = browserContext();
    assert.equal(resolveServerOrigin(context), `http://192.168.1.20:${DEFAULT_SERVER_PORT}`);
    assert.equal(getServerWsUrl(context), `ws://192.168.1.20:${DEFAULT_SERVER_PORT}/ws`);
});

test('https page derives a wss address so the browser does not block it', () => {
    const context = browserContext({ location: { protocol: 'https:', hostname: 'mahjong.example.com' } });
    assert.equal(getServerWsUrl(context), `wss://mahjong.example.com:${DEFAULT_SERVER_PORT}/ws`);
});

test('http and https map to ws and wss respectively', () => {
    assert.equal(toWebSocketUrl('http://192.168.1.10:3001'), 'ws://192.168.1.10:3001/ws');
    assert.equal(toWebSocketUrl('https://mahjong.example.com'), 'wss://mahjong.example.com/ws');
});

test('addresses are normalised so a trailing slash or stray path cannot break the url', () => {
    assert.equal(normalizeOrigin('http://192.168.1.10:3001/'), 'http://192.168.1.10:3001');
    assert.equal(normalizeOrigin('  http://192.168.1.10:3001/api/  '), 'http://192.168.1.10:3001');
    assert.equal(toWebSocketUrl('http://192.168.1.10:3001/'), 'ws://192.168.1.10:3001/ws');
});

test('nonsense addresses are rejected instead of producing a broken websocket url', () => {
    ['', '   ', 'localhost:3001', 'ftp://192.168.1.10', 'ws://192.168.1.10:3001', null, undefined, 42]
        .forEach(value => assert.equal(normalizeOrigin(value), null, `${value} 不应该被当成合法地址`));
});

test('an invalid stored override is ignored and the next source is used', () => {
    const context = packagedContext({
        storage: createStorage({ [SERVER_ORIGIN_STORAGE_KEY]: '这不是地址' }),
        buildEnv: { VITE_SERVER_ORIGIN: 'http://192.168.1.10:3001' }
    });
    assert.equal(resolveServerOrigin(context), 'http://192.168.1.10:3001');
});

test('storage failures do not crash the app', () => {
    const brokenStorage = { getItem() { throw new Error('WebView 禁用了本地存储'); } };
    const context = packagedContext({ storage: brokenStorage, buildEnv: { VITE_SERVER_ORIGIN: 'http://192.168.1.10:3001' } });
    assert.equal(resolveServerOrigin(context), 'http://192.168.1.10:3001');
});

test('manual override can be saved and cleared at runtime', () => {
    const storage = createStorage();
    const context = { globalScope: {}, storage };
    assert.equal(setServerOriginOverride('http://10.0.0.7:3001/', context), 'http://10.0.0.7:3001');
    assert.equal(storage.getItem(SERVER_ORIGIN_STORAGE_KEY), 'http://10.0.0.7:3001');
    assert.throws(() => setServerOriginOverride('乱填的地址', context), /服务器地址需要形如/);
    assert.equal(setServerOriginOverride('', context), null);
    assert.equal(storage.getItem(SERVER_ORIGIN_STORAGE_KEY), null);
});

test('capacitor and file protocols are both recognised as packaged runtimes', () => {
    assert.equal(isPackagedRuntime({ globalScope: { Capacitor: {} }, location: { protocol: 'https:' } }), true);
    assert.equal(isPackagedRuntime({ globalScope: {}, location: { protocol: 'capacitor:' } }), true);
    assert.equal(isPackagedRuntime({ globalScope: {}, location: { protocol: 'file:' } }), true);
    assert.equal(isPackagedRuntime({ globalScope: {}, location: { protocol: 'http:' } }), false);
});

test('diagnostics report which address is actually in use', () => {
    const context = packagedContext({ buildEnv: { VITE_SERVER_ORIGIN: 'http://192.168.1.10:3001' } });
    assert.deepEqual(describeServerConfig(context), {
        ok: true,
        packaged: true,
        origin: 'http://192.168.1.10:3001',
        wsUrl: 'ws://192.168.1.10:3001/ws',
        error: null
    });
});
