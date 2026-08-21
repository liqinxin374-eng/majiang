import test from 'node:test';
import assert from 'node:assert/strict';
import { createErrorLog, sanitizeError, saveErrorLog } from '../src/errorLogger.js';

test('error logger removes URL parameters and limits message length', () => {
    const result = sanitizeError('x'.repeat(400), 'https://game.example/app.js?token=secret');
    assert.equal(result.message.length, 300);
    assert.equal(result.source, 'https://game.example/app.js');
});

test('error logger keeps only the latest twenty local records', () => {
    const data = new Map();
    const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
    for (let index = 0; index < 21; index += 1) saveErrorLog(storage, createErrorLog(`错误${index}`));
    const logs = JSON.parse(storage.getItem('scifiMahjongErrorLogs'));
    assert.equal(logs.length, 20);
    assert.equal(logs[0].message, '错误1');
});
