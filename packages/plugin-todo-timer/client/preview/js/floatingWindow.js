/**
 * FloatingWindow · 页面内版（替代上游桌面悬浮胶囊）
 *  - 保留上游 index.js 依赖的 sendMessage API 面，改动面最小
 *  - 内部直接驱动 TomatoClock，UI 更新映射到主页面 DOM（同 id 元素）
 *  - 页面内迷你胶囊 pill：固定角落显示状态 + 倒计时
 *  - 桌面常驻能力预留：FloatingSurface 抽象点（将来 vibepm 有桌面壳可接入）
 */

// 状态文案单一源在 env.js UI_TEXT.capsuleStateText（主页面胶囊条/迷你浮窗共用）
const CLOCK_STATE_TEXT = UI_TEXT.capsuleStateText;

// 页面内迷你胶囊同步（生长浮层顶部胶囊）
function syncPill() {
  const pill = document.getElementById("growWin");
  if (!pill) return;
  if (typeof floatingWindow === "undefined" || !floatingWindow.clock) return;
  const clock = floatingWindow.clock;
  const state = clock.config.currentState;
  const t = clock.formatTime();
  pill.querySelector(".pill-state").textContent = CLOCK_STATE_TEXT[state] || "休息中";
  const timeEl = pill.querySelector(".pill-time");
  if (state === "idle") {
    timeEl.textContent = clock.formatTime(clock.config.workTime).minutes + " min";
  } else {
    timeEl.textContent = t.minutes + ":" + t.seconds;
  }
  pill.classList.toggle("active", state !== "idle");
  syncFocusTask();
}

/**
 * 专注任务名同步（验收：专注进行中，时钟旁与胶囊顶部都显示「正在专注哪条任务」）
 *  - 专注/暂停中：显示绑定任务（clock.config.boundTaskId，开始专注时锁定）
 *  - 其余状态：预览当前「在做」任务（下一次开始专注即绑定它）
 */
function syncFocusTask() {
  if (typeof floatingWindow === "undefined" || !floatingWindow.clock) return;
  if (typeof todoManger_ === "undefined") return;
  const clock = floatingWindow.clock;
  const focusing = clock.config.currentState === "working" || clock.config.currentState === "workPaused";
  const task = focusing ? todoManger_.findTask(clock.config.boundTaskId) : todoManger_.getActiveTask();
  const title = task && task.id !== -1 ? task.title : "";

  const label = document.getElementById("focusTaskLabel");
  if (label) {
    label.textContent = title ? UI_TEXT.focusIdlePrefix + title : "";
    label.style.display = title ? "" : "none";
  }
  const pillTask = document.getElementById("pill-task");
  if (pillTask) {
    pillTask.textContent = title;
    pillTask.style.display = title ? "" : "none";
  }
}

/**
 * 开始专注绑定锁定（验收：开始专注时，当前「在做」任务成为本次专注的绑定对象）
 * @param {TomatoClock} clock
 * @param {boolean} silent - true=休息结束自动开启的专注，不弹提示（避免每周期噪音）
 */
function bindActiveTaskToClock(clock, silent = false) {
  if (typeof todoManger_ === "undefined") return;
  const active = todoManger_.getActiveTask();
  clock.config.boundTaskId = active && active.id !== -1 ? active.id : -1;
  clock.saveConfig();
  // 没有「在做」任务：温和提示，不强制打断专注
  if (clock.config.boundTaskId === -1 && !silent && typeof showToast === "function") {
    showToast(UI_TEXT.toastNoBoundTask);
  }
  syncFocusTask();
}

class FloatingWindow {
  constructor() {
    this.bound = false;
    this.clock = new TomatoClock();
    // 延迟到当前脚本栈执行完（index.js 里 const floatingWindow 初始化后）再绑定 UI，
    // 否则 syncPill 会因 TDZ 引用 floatingWindow 抛错
    setTimeout(() => this.bindClock(), 0);
  }

  bindClock() {
    if (this.bound) return;
    this.bound = true;
    const clock = this.clock;
    const $ = (id) => document.getElementById(id);
    // 只切换生长动画 iframe 显隐，胶囊（growWin 顶部）任何时段都常驻。
    // 尊重「生长动画」开关与「专注时隐藏」（专注中强制隐藏动画）。
    const setGrowVisible = (on) => {
      const f = $("tomatoLife");
      if (!f) return;
      const eff = on &&
        settings.config.showTomatoAnimation !== false &&
        !(settings.config.autoHideAni && this.clock.config.currentState === "working");
      f.style.display = eff ? "block" : "none";
    };
    this.setGrowVisible = setGrowVisible;

    // 终局观测器：专注跑满后，让「转红→坠果→冻结」完整放映，再收回成仅胶囊并回种子
    // 注意：onWorkEnd / onStateChange 回调内 this 是 clock，故终局状态挂在 clock 上
    clock.endgamePlaying = false;
    clock.endgameTimer = null;
    const finishEndgame = () => {
      clock.endgamePlaying = false;
      if (clock.endgameTimer) { clearInterval(clock.endgameTimer); clock.endgameTimer = null; }
      setGrowVisible(false);
      if (typeof growBridge !== "undefined" && growBridge) growBridge.reset();
    };
    const waitEndgameThenCollapse = () => {
      if (clock.endgameTimer) clearInterval(clock.endgameTimer);
      let waited = 0;
      clock.endgameTimer = setInterval(() => {
        waited += 200;
        const st = (typeof growBridge !== "undefined" && growBridge && growBridge.state)
          ? growBridge.state() : null;
        if (st && st.stage === "frozen") { finishEndgame(); return; }
        if (waited > 12000) finishEndgame();   // 兜底：异常时不超过 ~12s 强制收回
      }, 200);
    };
    clock.waitEndgameThenCollapse = waitEndgameThenCollapse;

    // 读秒更新
    clock.onTick = function () {
      const t = this.formatTime();
      const minutes = $("minutes");
      const seconds = $("seconds");
      if (minutes) minutes.textContent = t.minutes;
      if (seconds) seconds.textContent = t.seconds;
      // 仅专注期间投进度给生长动画；其余时段不投，杜绝休息期也跟着「长高」
      // （暂停时倒计时已停、onTick 不再触发，画面随之冻结）
      if (this.config.currentState === "working" && typeof growBridge !== "undefined" && growBridge) {
        growBridge.apply(this.config.progress);
      }
      syncPill();
    };

    // 状态变更：更新状态文本 + 按钮显隐（主页面同 id 元素）
    clock.onStateChange = function () {
      const state = this.config.currentState;
      // 同步 #clockBox 状态 class（idle/working/...），驱动 frame.css 状态规则（如 .idle #beginBtn 大按钮）
      const clockBox = $("clockBox");
      if (clockBox) {
        clockBox.classList.remove("idle", "working", "workPaused", "breaking", "breakPaused");
        clockBox.classList.add(state);
      }
      const stateEl = $("state");
      if (stateEl) {
        stateEl.style.display = "flex";
        const textNode = Array.from(stateEl.childNodes).find(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
        );
        if (textNode) textNode.textContent = " " + (CLOCK_STATE_TEXT[state] || "休息中");
      }
      const begin = $("beginBtn");
      const pause = $("pauseBtn");
      const cont = $("continueBtn");
      const stop = $("stopBtn");
      const show = (el, on) => { if (el) el.style.display = on ? "flex" : "none"; };
      switch (state) {
        case "idle": {
          show(begin, true); show(pause, false); show(cont, false); show(stop, false);
          this.config.timeLeft = 0;
          const t0 = this.formatTime(this.config.workTime);
          const m0 = $("minutes");
          const s0 = $("seconds");
          if (m0) m0.textContent = t0.minutes;
          if (s0) s0.textContent = t0.seconds;
          // 胶囊常驻；隐藏生长动画并回种子（finishEndgame 顺带清掉终局播放标志/定时器）
          finishEndgame();
          break;
        }
        case "working": {
          show(begin, false); show(pause, true); show(cont, false); show(stop, true);
          // 专注开始：显示生长动画并投当前进度（0）
          setGrowVisible(true);
          if (typeof growBridge !== "undefined" && growBridge) growBridge.apply(this.config.progress || 0);
          break;
        }
        case "workPaused":
          show(begin, false); show(pause, false); show(cont, true); show(stop, true);
          // 专注暂停：动画保留在冻结画面
          setGrowVisible(true);
          break;
        case "breakPaused":
          show(begin, false); show(pause, false); show(cont, true); show(stop, true);
          // 休息暂停：隐藏生长动画（终局放映期间除外，待冻结后再收）
          if (!this.endgamePlaying) setGrowVisible(false);
          break;
        case "breaking":
          show(begin, false); show(pause, true); show(cont, false); show(stop, true);
          // 休息中：专注跑满的终局（转红→坠果→冻结）仍需放映完整，故不立即隐藏；
          // 待终局冻结后由观测器收成仅胶囊。其余情况直接隐藏生长动画。
          if (!this.endgamePlaying) setGrowVisible(false);
          break;
      }
      syncPill();
    };

    // 工作结束：回调主页面统计/记番茄；同时驱动生长动画终局
    clock.onWorkEnd = async function () {
      const raw = this.config.progress || 0;
      const full = raw >= 0.99;   // 用原始进度判断是否跑满，避免 round 损耗
      const progress = Math.round(this.config.progress * 10) / 10;
      const duration = this.config.totalTime;
      if (typeof growBridge !== "undefined" && growBridge) {
        if (full) {
          // 跑满：标记终局待放映，触发转红→坠果，并让画面从休息切出时保持可见
          this.endgamePlaying = true;
          growBridge.rip();
          this.waitEndgameThenCollapse();
        } else {
          // 未满（中止）：回种子
          growBridge.reset();
        }
      }
      if (typeof onWorkEnd === "function") await onWorkEnd(duration, progress);
      return Promise.resolve();
    };

    // 休息结束：回调统计；随后若自动进入下一段专注，绑定对象=当时的「在做」任务（静默，不弹提示）
    clock.onBreakEnd = async function () {
      const duration = this.isLongBreak() ? this.config.longBreakTime : this.config.shortBreakTime;
      const type = this.isLongBreak() ? "longBreak" : "shortBreak";
      const progress = this.config.progress.toFixed(1);
      if (typeof onBreakEnd === "function") await onBreakEnd(duration, type, progress);
      bindActiveTaskToClock(this, true);
      return Promise.resolve();
    };

    clock.continueState(); // 恢复跨会话计时
    this.refresh();
    syncPill();

    // 跨窗口同步（单一源 clockSync.js）：各窗口实例共用 localStorage（todo-tomato:*），
    // storage 事件双向同步时钟/任务/设置；页面级联动通过钩子注入。
    installClockStorageSync(clock, {
      onClockResync: () => this.refresh(),
      onTodoListChange: () => {
        if (typeof todoManger_ !== "undefined" && todoManger_) {
          todoManger_.getTaskList(); // 重读存储（其他实例可能已完成任务/落账番茄）
          todoManger_.onChange();    // 触发主列表重渲染
          if (typeof updatePageTodayTomatosNum === "function") updatePageTodayTomatosNum();
        }
        syncFocusTask();
      },
      onSettingsChange: () => {
        this.refresh();
        // 设置变化（如浮窗开关）后同步重渲染设置页开关状态
        if (typeof settingsPageComponent !== "undefined" && settingsPageComponent) {
          settingsPageComponent.forEach((c) => c.component && c.component.render && c.component.render());
        }
      },
    });
  }

  // 上游 index.js 只调 sendMessage，这里直接驱动 clock
  sendMessage(message) {
    const clock = this.clock;
    switch (message.type) {
      case "clockBegin":
        bindActiveTaskToClock(clock); // 开始专注即锁定绑定当前「在做」任务
        clock.begin();
        break;
      case "clockPause":
        clock.pause();
        break;
      case "clockContinue":
        clock.continue();
        break;
      case "clockStop":
        clock.stop();
        break;
      case "clockSettingChanged":
        clock.settingChanged(message.content);
        break;
      case "opacityChange":
        this.setOpacity(message.content);
        break;
      case "updateTask":
      case "updateTag":
        // 当前任务变更：同步刷新时钟旁/胶囊上的任务名（专注中仍显示绑定任务）
        syncFocusTask();
        break;
    }
  }

  // 按当前胶囊设置整体刷新 growWin：主开关显隐 / 透明度 / 生长动画可见性
  refresh() {
    const cap = document.getElementById("growWin");
    if (cap) {
      cap.style.display = settings.config.showFloatingWindow === false ? "none" : "";
      cap.style.opacity = settings.config.opacity != null ? settings.config.opacity : 1;
    }
    // 依当前时钟状态重判动画可见性（尊重 生长动画 / 专注时隐藏）
    const st = this.clock.config.currentState;
    let animOn = false;
    if (st === "working" || st === "workPaused") animOn = true;
    else if ((st === "breaking" || st === "breakPaused") && this.clock.endgamePlaying) animOn = true;
    if (this.setGrowVisible) this.setGrowVisible(animOn);
  }

  setOpacity(value) {
    const cap = document.getElementById("growWin");
    if (cap) cap.style.opacity = value;
  }

  // 桌面浮层开关（页面内版为预留接口，暂空实现）
  show() {}
  close() {}
}
