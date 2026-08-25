/**
 * 创建回合流程调度器。
 *
 * 通俗理解：自动出牌流程像接力赛，这个调度器只允许场上保留一根接力棒。
 * 新任务到来时会收回旧接力棒，避免安卓触摸重复回调或计时器延迟后把回合推进两次。
 */
export function createTurnFlowScheduler({
    setTimer = setTimeout,
    clearTimer = clearTimeout
} = {}) {
    // 保存当前唯一的计时任务编号；null 表示现在没有待执行任务。
    let pendingTimer = null;

    // 每次取消流程都增加版本号，让已经过期的回调即使醒来也不能继续改牌局。
    let flowVersion = 0;

    // 每次安排动作都增加任务号，区分同一局里先后创建的两个自动动作。
    let taskVersion = 0;

    function cancel() {
        // 计时任务还没执行时，先从系统计时队列中移除它。
        if (pendingTimer !== null) {
            clearTimer(pendingTimer);
            pendingTimer = null;
        }

        // 标记之前创建的所有任务都属于旧流程。
        flowVersion += 1;

        // 同时作废当前牌局里尚未完成的旧任务号。
        taskVersion += 1;
    }

    function schedule(callback, delay = 0) {
        // 同一局只能等待一个自动动作；后来的正确动作替换先前的重复动作。
        if (pendingTimer !== null) {
            clearTimer(pendingTimer);
            pendingTimer = null;
        }

        // 记住任务创建时所属的牌局流程版本。
        const scheduledVersion = flowVersion;

        // 为本次动作发放唯一任务号；后来安排的动作会让这个号码过期。
        const scheduledTaskVersion = taskVersion + 1;
        taskVersion = scheduledTaskVersion;

        // 延迟执行，保留机器人出牌动画和玩家观察牌面的时间。
        pendingTimer = setTimer(() => {
            // 新一局或手动取消后，旧任务不能再碰当前牌局。
            if (scheduledVersion !== flowVersion) return;

            // 同一局里被后来动作替换的旧任务也不能推进回合。
            if (scheduledTaskVersion !== taskVersion) return;

            // 任务确认有效后再释放占用，允许回调安排下一棒动作。
            pendingTimer = null;

            // 只有仍然有效的唯一任务才真正推进回合。
            callback();
        }, delay);
    }

    return {
        cancel,
        schedule,
        // 测试和诊断时可读取，业务代码不能直接修改这个状态。
        get hasPending() {
            return pendingTimer !== null;
        }
    };
}
