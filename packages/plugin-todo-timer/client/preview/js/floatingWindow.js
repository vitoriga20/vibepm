/**
 * FloatingWindow · 页面内版（替代上游桌面悬浮胶囊）
 *  - 保留上游 index.js 依赖的 sendMessage API 面，改动面最小
 *  - 内部直接驱动 TomatoClock，UI 更新映射到主页面 DOM（同 id 元素）
 *  - 页面内迷你胶囊 pill：固定角落显示状态 + 倒计时
 *  - 桌面常驻能力预留：FloatingSurface 抽象点（将来 vibepm 有桌面壳可接入）
 */

const CLOCK_STATE_TEXT = {
  idle: "休息中",
  working: "专注中",
  workPaused: "已暂停",
  breaking: "休息中",
  breakPaused: "休息暂停",
};

function playSound(src) {
  try {
    if (typeof settings !== "undefined" && settings.config.soundEffect === false) return;
    const audio = new Audio(src);
    audio.volume = 0.6;
    audio.play();
  } catch (e) {
    console.warn("playSound 失败:", e);
  }
}

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
    // 只切换生长动画 iframe 显隐，胶囊（growWin 顶部）任何时段都常驻
    const setGrowVisible = (on) => {
      const f = $("tomatoLife");
      if (f) f.style.display = on ? "block" : "none";
    };

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

    // 工作结束：提示音 + 回调主页面统计/记番茄；同时驱动生长动画终局
    clock.onWorkEnd = async function () {
      const raw = this.config.progress || 0;
      const full = raw >= 0.99;   // 用原始进度判断是否跑满，避免 round 损耗
      const progress = Math.round(this.config.progress * 10) / 10;
      const duration = this.config.totalTime;
      playSound("audio/353206__rhodesmas__intro-01.aac");
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

    // 休息结束：提示音 + 回调统计
    clock.onBreakEnd = async function () {
      const duration = this.isLongBreak() ? this.config.longBreakTime : this.config.shortBreakTime;
      const type = this.isLongBreak() ? "longBreak" : "shortBreak";
      const progress = this.config.progress.toFixed(1);
      playSound("audio/76405__dsp9000__old-church-bell.aac");
      if (typeof onBreakEnd === "function") await onBreakEnd(duration, type, progress);
      return Promise.resolve();
    };

    clock.continueState(); // 恢复跨会话计时
    syncPill();
  }

  // 上游 index.js 只调 sendMessage，这里直接驱动 clock
  sendMessage(message) {
    const clock = this.clock;
    switch (message.type) {
      case "clockBegin":
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
        const body = document.getElementById("mainBody");
        if (body) body.style.opacity = message.content;
        break;
    }
  }

  // 桌面浮层开关（页面内版为预留接口，暂空实现）
  show() {}
  close() {}
}
