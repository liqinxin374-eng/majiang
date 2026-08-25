import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnFlowScheduler } from '../src/turnFlowScheduler.js';

function createFakeTimers() {
    // 用数组模拟手机系统里的计时任务队列，测试时不需要真的等待。
    const timers = [];

    return {
        timers,
        setTimer(callback) {
            // 保存待执行函数，并返回它在数组里的编号。
            timers.push(callback);
            return timers.length - 1;
        },
        clearTimer(timerId) {
            // 被取消的任务改成空值，表示它不能再执行。
            timers[timerId] = null;
        }
    };
}

test('重复安排回合推进时只执行最后一个任务', () => {
    const fakeTimers = createFakeTimers();
    const scheduler = createTurnFlowScheduler(fakeTimers);
    const completedActions = [];

    scheduler.schedule(() => completedActions.push('旧任务'), 300);
    const staleCallback = fakeTimers.timers[0];
    scheduler.schedule(() => completedActions.push('新任务'), 300);

    // 强行模拟安卓系统晚到的旧回调，任务号校验仍会拦住它。
    staleCallback();
    assert.equal(scheduler.hasPending, true);

    // 再唤醒当前有效任务，只有它可以真正推进回合。
    fakeTimers.timers[1]();

    assert.deepEqual(completedActions, ['新任务']);
    assert.equal(scheduler.hasPending, false);
});

test('开始新一局后旧回合任务不能修改新牌局', () => {
    const fakeTimers = createFakeTimers();
    const scheduler = createTurnFlowScheduler(fakeTimers);
    let advanceCount = 0;

    scheduler.schedule(() => { advanceCount += 1; }, 300);
    const staleCallback = fakeTimers.timers[0];
    scheduler.cancel();

    // 即使手机系统晚到的旧回调仍被唤醒，版本校验也会把它拦住。
    staleCallback();

    assert.equal(advanceCount, 0);
    assert.equal(scheduler.hasPending, false);
});
