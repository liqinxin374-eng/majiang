const MAX_LOGS = 20;
const STORAGE_KEY = 'scifiMahjongErrorLogs';

// 删除可能包含个人信息的地址参数，只保留报错位置与原因。
export function sanitizeError(message, source = '') {
    return {
        message: String(message || '未知错误').slice(0, 300),
        source: String(source || '').split('?')[0].slice(0, 300)
    };
}

export function createErrorLog(message, source = '') {
    return { ...sanitizeError(message, source), time: new Date().toISOString() };
}

export function saveErrorLog(storage, log) {
    const previous = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    const next = [...previous, log].slice(-MAX_LOGS);
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
}

export function initErrorLogger() {
    const record = (message, source) => {
        try {
            saveErrorLog(window.localStorage, createErrorLog(message, source));
        } catch {
            // 日志失败不能影响麻将游戏继续运行。
        }
    };

    window.addEventListener('error', event => record(event.message, event.filename));
    window.addEventListener('unhandledrejection', event => record(event.reason?.message || event.reason, 'promise'));
}
