/**
 * 服务器地址：全项目唯一的配置入口。
 *
 * ── 为什么需要这个文件 ──
 * 以前代码是这样猜服务器地址的：
 *     const host = window.location.hostname;   // 页面是从哪来的
 *     new WebSocket(`ws://${host}:3001/ws`);
 * 这在“电脑浏览器打开开发服务器”时碰巧是对的，因为网页和后端确实在同一台机器上。
 *
 * 但打包成手机 App 之后，网页是从手机本地文件加载的，
 * location.hostname 会变成 localhost —— 于是手机去连它自己，当然连不上。
 * 手机上根本没有后端程序。
 *
 * 所以地址必须“明确告诉”App，不能靠猜。下面是四级优先级，从高到低：
 *
 *   1) localStorage 里的 mahjong.serverOrigin —— 运行期覆盖。
 *      测试同学在真机上不用重装包，改一下就能切到另一台服务器。
 *   2) window.__MAHJONG_SERVER_ORIGIN__ —— 部署期覆盖。
 *      运维可以直接改 dist/index.html，不用重新构建。
 *   3) 构建期注入的 VITE_SERVER_ORIGIN —— 正式发版走这条。
 *   4) 只有“普通浏览器环境”才允许退回到用页面地址推导（本地开发方便）。
 *
 * 打包环境里如果一条都没配，就直接报错，绝不悄悄退回 localhost。
 * 上一次的事故就是因为它失败得太安静，要四台真机才发现。
 */

/** 运行期覆盖用的 localStorage 键名。 */
export const SERVER_ORIGIN_STORAGE_KEY = 'mahjong.serverOrigin';

/** 部署期覆盖用的全局变量名。 */
export const SERVER_ORIGIN_GLOBAL_KEY = '__MAHJONG_SERVER_ORIGIN__';

/** 本地开发时后端的默认端口，与 server/index.js 保持一致。 */
export const DEFAULT_SERVER_PORT = 3001;

/** 实时通道的路径，与 server/webSocketServer.js 的 upgrade 判断保持一致。 */
export const WEBSOCKET_PATH = '/ws';

const MISSING_CONFIG_MESSAGE =
    '未配置服务器地址：当前是安装包环境，无法自动推导后端地址。' +
    '请在构建时设置 VITE_SERVER_ORIGIN（例如 http://192.168.1.10:3001），' +
    '或在设置里手动填写服务器地址后重试。';

/** 读取构建期注入的变量。Node 测试环境里没有 import.meta.env，这里要能兜住。 */
function readBuildEnv() {
    try {
        return import.meta.env ?? {};
    } catch {
        return {};
    }
}

/**
 * 判断当前是不是“安装包环境”（Android / iOS 的 WebView），而不是普通浏览器。
 * 打包环境下页面来源和后端一定不是同一个地方，因此不允许靠页面地址推导。
 */
export function isPackagedRuntime(context = {}) {
    const { globalScope = globalThis, location = globalScope?.location } = context;
    if (globalScope?.Capacitor) return true;
    const protocol = location?.protocol ?? '';
    return protocol === 'capacitor:' || protocol === 'file:' || protocol === 'ionic:';
}

/**
 * 把用户填的地址统一成规范形式：去掉末尾斜杠，并确认协议是 http/https。
 * @returns {string|null} 不合法时返回 null，让调用方继续看下一级配置。
 */
export function normalizeOrigin(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    // origin 已经不含末尾斜杠，但显式拼一次更清楚，也顺便丢掉 path/query。
    return `${parsed.protocol}//${parsed.host}`;
}

function readStorageOrigin(storage) {
    try {
        return normalizeOrigin(storage?.getItem(SERVER_ORIGIN_STORAGE_KEY));
    } catch {
        // 隐私模式或 WebView 禁用存储时 getItem 会抛异常，忽略即可。
        return null;
    }
}

/**
 * 按四级优先级解析后端地址。这是一个纯函数：所有外部依赖都从 context 传进来，
 * 因此可以在 Node 里直接单测，不需要浏览器。
 *
 * @param {object} context
 * @param {object} [context.globalScope] 默认 globalThis
 * @param {object} [context.storage] 默认 globalScope.localStorage
 * @param {object} [context.location] 默认 globalScope.location
 * @param {object} [context.buildEnv] 默认构建期注入的 import.meta.env
 * @param {boolean} [context.packaged] 默认自动判断
 * @returns {string} 形如 http://192.168.1.10:3001 的地址
 */
export function resolveServerOrigin(context = {}) {
    const {
        globalScope = globalThis,
        storage = globalScope?.localStorage,
        location = globalScope?.location,
        buildEnv = readBuildEnv(),
        packaged = isPackagedRuntime({ globalScope, location })
    } = context;

    // 1) 运行期覆盖：真机上改完立刻生效，不用重新出包。
    const fromStorage = readStorageOrigin(storage);
    if (fromStorage) return fromStorage;

    // 2) 部署期覆盖：改 dist/index.html 即可，不用重新构建。
    const fromGlobal = normalizeOrigin(globalScope?.[SERVER_ORIGIN_GLOBAL_KEY]);
    if (fromGlobal) return fromGlobal;

    // 3) 构建期注入：CI 出正式包走这条。
    const fromBuild = normalizeOrigin(buildEnv?.VITE_SERVER_ORIGIN);
    if (fromBuild) return fromBuild;

    // 4) 只有普通浏览器才允许推导，方便本地 npm run dev。
    if (!packaged) {
        const derived = deriveOriginFromLocation(location);
        if (derived) return derived;
    }

    throw new Error(MISSING_CONFIG_MESSAGE);
}

/** 浏览器开发场景：认为后端和网页在同一台机器上，只是端口不同。 */
function deriveOriginFromLocation(location) {
    const hostname = location?.hostname;
    if (!hostname) return null;
    const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${hostname}:${DEFAULT_SERVER_PORT}`;
}

/** 把 http/https 地址换算成对应的 ws/wss 实时地址。 */
export function toWebSocketUrl(origin, path = WEBSOCKET_PATH) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) throw new Error(`服务器地址不合法：${origin}`);
    // https 必须配 wss，http 配 ws；混用会被浏览器和 WebView 直接拦掉。
    return `${normalized.replace(/^http/, 'ws')}${path}`;
}

/** 取后端 HTTP 根地址，例如 http://192.168.1.10:3001 。 */
export function getServerHttpUrl(context = {}) {
    return resolveServerOrigin(context);
}

/** 取后端实时地址，例如 ws://192.168.1.10:3001/ws 。 */
export function getServerWsUrl(context = {}) {
    return toWebSocketUrl(resolveServerOrigin(context));
}

/**
 * 手动指定服务器地址（写进 localStorage）。传空值表示清除覆盖、回到默认来源。
 * @returns {string|null} 实际生效的地址
 */
export function setServerOriginOverride(value, context = {}) {
    const { globalScope = globalThis, storage = globalScope?.localStorage } = context;
    if (value === null || value === undefined || String(value).trim() === '') {
        storage?.removeItem(SERVER_ORIGIN_STORAGE_KEY);
        return null;
    }
    const normalized = normalizeOrigin(value);
    if (!normalized) throw new Error('服务器地址需要形如 http://192.168.1.10:3001 。');
    storage?.setItem(SERVER_ORIGIN_STORAGE_KEY, normalized);
    return normalized;
}

/** 诊断信息：出问题时可以直接打到界面上，看清楚到底用的是哪一级配置。 */
export function describeServerConfig(context = {}) {
    const { globalScope = globalThis, location = globalScope?.location } = context;
    const packaged = isPackagedRuntime({ globalScope, location });
    try {
        const origin = resolveServerOrigin({ ...context, packaged });
        return { ok: true, packaged, origin, wsUrl: toWebSocketUrl(origin), error: null };
    } catch (error) {
        return { ok: false, packaged, origin: null, wsUrl: null, error: error.message };
    }
}
