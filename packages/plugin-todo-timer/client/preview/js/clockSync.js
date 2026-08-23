/**
 * clockSync.js · 跨窗时钟同步单一源（index.html 与 capsule.html 共用）
 *  - 双页共用 localStorage（todo-tomato:*），storage 事件双向同步时钟/任务/设置
 *  - 接收方只读重载 + 纯展示计时器：不重建倒计时（避免两页各自跑结束流程互相踩），
 *    用保存的 endTime 推算剩余时间展示；到点统一走 switchState（记账锁防重）
 *  - 不变量（改动前必读）：
 *      · 不能走 getConfig（会回写 storage 引发双页乒乓）
 *      · 不能走 continueState（遗留 pauseTimeFlag=true 会让活跃会话瞬间判为结束）
 *      · 过渡态落盘先于 countdown 刷新 endTime：刚切换的保存常带上一段已过期 endTime，
 *        接收方若缺失/已过期须按当前状态重算整段时长，否则瞬间误判结束引发双向连锁
 *  - 依赖：env.js（store/settings）、clock.js（TomatoClock 实例）需先于本文件加载
 */

/**
 * 双页记账互斥锁：任一页落账后 5s 内，另一页同进度结束不重复记账。
 * 锁本身走 localStorage（todo-tomato:workEndLock），无监听器 → 不会引发同步乒乓。
 */
function tryLockWorkEnd(progress) {
  try {
    const now = Date.now();
    const lock = store.getItem("workEndLock");
    if (lock && now - lock.ts < 5000 && Math.abs(lock.progress - progress) < 0.01) return false;
    store.setItem("workEndLock", { ts: now, progress });
    return true;
  } catch (e) {
    return true;
  }
}

/**
 * 给一个 TomatoClock 实例装上跨窗同步（storage 监听 + 纯展示计时器）。
 * @param {TomatoClock} clock 本页的时钟实例
 * @param {{onClockResync?:Function, onTodoListChange?:Function, onSettingsChange?:Function}} hooks
 *   页面级联动：onClockResync=时钟重载后（主页面 refresh）；onTodoListChange=任务快照变更；
 *   onSettingsChange=设置变更（settings.config 已由本函数刷新，钩子做应用层动作）
 */
function installClockStorageSync(clock, hooks) {
  hooks = hooks || {};

  function resyncClock() {
    const saved = store.getItem("clock");
    if (!saved) return;
    clock.config = { ...clock.defaultConfig, ...saved };
    if (clock.timer) { clearInterval(clock.timer); clock.timer = null; } // 清掉任何残留本地倒计时
    const st = clock.config.currentState;
    if (st === "working" || st === "breaking") {
      clock.config.pauseTimeFlag = false;
      clock.config.pauseLeftTime = 0;
      const dur = st === "working"
        ? clock.config.workTime
        : (clock.config.currentCycle % clock.config.longBreakInterval === 0
          ? clock.config.longBreakTime
          : clock.config.shortBreakTime);
      if (!(clock.config.endTime - Date.now() > 0)) {
        clock.config.totalTime = dur;
        clock.config.endTime = Date.now() + dur;
      }
      const tick = () => {
        clock.config.timeLeft = Math.max(clock.config.endTime - Date.now(), 0);
        clock.config.progress = clock.config.totalTime ? parseFloat((1 - clock.config.timeLeft / clock.config.totalTime).toFixed(2)) : 0;
        const cs = Math.floor(clock.config.timeLeft / 1000);
        if (clock.lastSeconds !== cs) { clock.lastSeconds = cs; clock.onTick(); }
        if (clock.isWorking()) clock.onWorkTick();
        if (clock.isBreaking()) clock.onBreakTick();
        if (clock.config.timeLeft <= 0) {
          clearInterval(clock.timer); clock.timer = null;
          clock.config.timeLeft = 0;
          clock.switchState(); // 统一结束流程；tryLockWorkEnd 保证只有一方落账
        }
      };
      tick();
      clock.onTick();
      clock.onStateChange();
      clock.timer = setInterval(tick, 100);
    } else {
      clock.onTick();
      clock.onStateChange();
    }
    if (hooks.onClockResync) hooks.onClockResync();
  }

  window.addEventListener("storage", (e) => {
    if (!e.key) return;
    if (e.key === "todo-tomato:clock") {
      resyncClock();
    } else if (e.key === "todo-tomato:todoList") {
      if (hooks.onTodoListChange) hooks.onTodoListChange();
    } else if (e.key === "todo-tomato:settings") {
      const s = store.getItem("settings");
      settings.config = { ...settings.defaultConfig, ...(s || {}) };
      if (hooks.onSettingsChange) hooks.onSettingsChange();
    }
  });

  return { resyncClock };
}
