/**
 * clockSync.js · 跨窗时钟同步单一源（index.html 与 capsule.html 共用）
 *  - 双页共用 localStorage（todo-tomato:*），storage 事件双向同步时钟/任务/设置
 *  - 接收方只读重载 + 纯展示计时器：不重建倒计时（避免两页各自跑结束流程互相踩），
 *    用保存的 endTime 推算剩余时间展示；到点统一走 switchState（记账锁防重）
 *  - 不变量（改动前必读）：
 *      · 不能走 getConfig（会回写 storage 引发双页乒乓）
 *      · 接续/重载统一走 clock.runDisplayTimer()（clock.js 单一源）：保留已落盘 endTime 推算剩余，
 *        不重建倒计时（重建会覆盖 startTime 让活跃会话从满时长重来）；continueState 已改走同一路径
 *      · 过渡态落盘先于 countdown 刷新 endTime：刚切换的保存常带上一段已过期 endTime，
 *        接收方若缺失/已过期须按当前状态重算整段时长，否则瞬间误判结束引发双向连锁
 *  - 依赖：env.js（store/settings）、clock.js（TomatoClock 实例）需先于本文件加载
 */

/**
 * 双页记账互斥锁：任一页落账后 5s 内，另一页同进度结束不重复记账。
 * 锁本身走 localStorage（todo-tomato:workEndLock），无监听器 → 不会引发同步乒乓。
 * 双窗竞态（两页同刻到点、读-判-写非原子）：改为「写入 → 沉淀 → 回读」选举——
 * 先写唯一令牌，150ms 后回读，只有最后写入者胜出（先写方发现令牌易主即让位），
 * 保证同一段专注/休息只有一方记账。返回 Promise<boolean>。
 */
function tryLockWorkEnd(progress) {
  return new Promise((resolve) => {
    try {
      const now = Date.now();
      const lock = store.getItem("workEndLock");
      if (lock && now - lock.ts < 5000 && Math.abs(lock.progress - progress) < 0.01) {
        resolve(false); // 已有近锁（对方已赢或正在选举）：直接让位
        return;
      }
      const token = `${now}_${Math.random().toString(36).slice(2)}`;
      store.setItem("workEndLock", { ts: now, progress, token });
      setTimeout(() => {
        try {
          const after = store.getItem("workEndLock");
          resolve(!!after && after.token === token);
        } catch (e) {
          resolve(true);
        }
      }, 150);
    } catch (e) {
      resolve(true);
    }
  });
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
    // 展示计时单一源：保留已落盘 endTime 推算剩余；到点走 switchState（记账锁防重）
    clock.runDisplayTimer();
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
