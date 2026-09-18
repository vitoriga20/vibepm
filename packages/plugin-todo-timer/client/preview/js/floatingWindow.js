/**
 * FloatingWindow · 主页面时钟驱动中枢（页面内版，历史遗留类名）
 *  - 保留上游 index.js 依赖的 sendMessage API 面，改动面最小
 *  - 内部直接驱动 TomatoClock，UI 更新映射到主页面 DOM（同 id 元素）
 *  - 胶囊/盆栽浮层已迁出：桌面形态见 capsule.html/capsule.js（桌面胶囊窗）
 */

// 状态文案单一源在 env.js UI_TEXT.capsuleStateText（主页面状态行 / 桌面胶囊共用）
const CLOCK_STATE_TEXT = UI_TEXT.capsuleStateText;

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

    // 读秒更新
    clock.onTick = function () {
      const t = this.formatTime();
      const minutes = $("minutes");
      const seconds = $("seconds");
      if (minutes) minutes.textContent = t.minutes;
      if (seconds) seconds.textContent = t.seconds;
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
          break;
        }
        case "working":
          show(begin, false); show(pause, true); show(cont, false); show(stop, true);
          break;
        case "workPaused":
          show(begin, false); show(pause, false); show(cont, true); show(stop, true);
          break;
        case "breakPaused":
          show(begin, false); show(pause, false); show(cont, true); show(stop, true);
          break;
        case "breaking":
          show(begin, false); show(pause, true); show(cont, false); show(stop, true);
          break;
      }
    };

    // 工作结束：回调主页面统计/记番茄（盆栽终局放映归桌面胶囊页 capsule.js）
    clock.onWorkEnd = async function () {
      const progress = Math.round(this.config.progress * 10) / 10;
      const duration = this.config.totalTime;
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

    // 跨窗口同步（单一源 clockSync.js）：各窗口实例共用 localStorage（todo-tomato:*），
    // storage 事件双向同步时钟/任务/设置；页面级联动通过钩子注入。
    installClockStorageSync(clock, {
      onClockResync: () => clock.onStateChange(),
      onTodoListChange: () => {
        if (typeof todoManger_ !== "undefined" && todoManger_) {
          todoManger_.getTaskList(); // 重读存储（桌面胶囊等其他实例可能已完成任务/落账番茄）
          todoManger_.onChange();    // 触发主列表重渲染
          if (typeof updatePageTodayTomatosNum === "function") updatePageTodayTomatosNum();
        }
        syncFocusTask();
      },
      onSettingsChange: () => {
        // 设置变化（如桌面胶囊开关）后同步重渲染设置页开关状态
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
      case "updateTask":
      case "updateTag":
        // 当前任务变更：刷新时钟旁任务名（专注中仍显示绑定任务）
        syncFocusTask();
        break;
    }
  }
}
