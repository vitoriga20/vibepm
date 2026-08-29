/**
 * capsule.js 桌面胶囊（capsule.html 配套）
 *  - 左：盆栽生长动画（tomato-life iframe，裁剪 viewBox 只显示盆栽）
 *  - 右：工业科研终端风格翻牌倒计时器（机械记牌器式 MM:SS 翻牌，见 style/flap.css）
 *  - 数据层走 todoData.js 单一源，跨窗同步走 clockSync.js 单一源
 *  - 独立小窗常驻桌面（主窗口最小化后仍在）：拖拽移动（moveTo）、位置记忆、
 *    右键/⋯菜单、双击开主界面；被手动关闭时回写 showDesktopCapsule=false 同步设置开关
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  /* ————————————————— tomato-life 生长动画桥（同 growBridge 的 iframe 投影协议） ————————————————— */

  const tomatoIframe = $("tomatoLife");
  let tomatoLoaded = false;
  /* 画内已无 HUD/按钮/背景（源文件已删），注入样式只需让动画铺满容器 */
  const HIDE_CSS = `html,body{height:100%;margin:0;overflow:hidden;display:block;background:transparent;}
    body{align-items:flex-start;justify-content:flex-start;}
    .wrap{position:relative;width:100%!important;height:100%!important;max-height:none!important;aspect-ratio:auto!important;}`;

  tomatoIframe.addEventListener("load", () => {
    const doc = tomatoIframe.contentDocument;
    if (!doc) return;
    const style = doc.createElement("style");
    style.textContent = HIDE_CSS;
    doc.head.appendChild(style);
    /* 胶囊只展示盆栽主体：裁剪场景 viewBox（主页面右下角浮层不受影响） */
    const scene = doc.getElementById("scene");
    if (scene) scene.setAttribute("viewBox", "290 90 390 560");
    tomatoLoaded = true;
    growReset();
  });

  function tomatoApi() {
    return tomatoIframe.contentWindow && tomatoIframe.contentWindow.__TOMATO__;
  }
  /** 投进度 0~1 */
  function growApply(p) {
    const t = tomatoApi();
    if (t) t.set(p);
  }
  /** 触发转红 → 坠果 → 终局冻结 */
  function growRip() {
    const t = tomatoApi();
    if (t) t.jump();
  }
  /** 回种子并解锁冻结（支持下一轮专注） */
  function growReset() {
    const t = tomatoApi();
    if (t) t.resetAll();
    else if (tomatoLoaded) growApply(0);
  }
  /** 读取动画阶段（供终局判定是否已冻结） */
  function growState() {
    const t = tomatoApi();
    return t ? t.get() : null;
  }

  /** 生长动画可见性：尊重「生长动画」开关与「专注时隐藏」（同主页面 refresh 口径） */
  function refreshAnimationVisible() {
    const st = clock.config.currentState;
    const on = settings.config.showTomatoAnimation !== false &&
      !(settings.config.autoHideAni && st === "working");
    tomatoIframe.style.display = on ? "block" : "none";
  }

  /* ————————————————— 工业翻牌倒计时显示（机械记牌器） —————————————————
     每块数字 .flap 内 4 个半片：静态上/下半片 + 临时折叠片/翻起片。
     syncFlips 只翻变化的那位；分钟进位时多位按右→左级差 130ms 依次翻。
     翻牌瞬间整块压暗（flapThud）+ 运行灯闪一次（机械卡扣感）。 */
  const FLAP = {
    els: [],
    prev: ["0", "0", "0", "0"],
    HALF_MS: 250,     // 单片半程（上片折叠 / 下片翻起）
    STAGGER: 130,     // 多位连续翻牌的级差
  };
  (function initFlaps() {
    for (let i = 0; i < 4; i++) {
      FLAP.els.push(document.querySelector(`.flap[data-digit="${i}"]`));
    }
  })();

  function setFlapStatic(f, v) {
    f.querySelector(".fh-top .fv").textContent = v;
    f.querySelector(".fh-bot .fv").textContent = v;
  }
  /** 无动画直接落值（idle 复位 / 进入休息时长） */
  function snapFlips(mm, ss) {
    const v = [mm[0], mm[1], ss[0], ss[1]];
    FLAP.prev = v.slice();
    FLAP.els.forEach((f, i) => {
      f.classList.remove("flipping");
      setFlapStatic(f, v[i]);
    });
  }
  /** 每秒调用：仅翻变化的那一位；进位时右→左依次翻 */
  function syncFlips(mm, ss) {
    const v = [mm[0], mm[1], ss[0], ss[1]];
    const changed = [];
    for (let i = 0; i < 4; i++) if (v[i] !== FLAP.prev[i]) changed.push(i);
    if (!changed.length) return;
    const order = changed.slice().sort((a, b) => b - a);
    order.forEach((i, k) => flipDigit(i, FLAP.prev[i], v[i], k * FLAP.STAGGER));
    FLAP.prev = v;
  }
  function flipDigit(i, oldV, newV, delay) {
    const f = FLAP.els[i];
    const top = f.querySelector(".fh-top .fv");
    const bot = f.querySelector(".fh-bot .fv");
    const fold = f.querySelector(".fh-fold .fv");
    const rise = f.querySelector(".fh-rise .fv");
    setTimeout(() => {
      top.textContent = newV;   // 新上半片：旧片折叠时被露出
      fold.textContent = oldV;  // 折叠片持旧值，自上向下折叠
      rise.textContent = newV;  // 翻起片持新值，后半程自下向上
      bot.textContent = oldV;   // 静态下半片维持旧值，待翻起片覆盖
      f.classList.remove("flipping");
      void f.offsetWidth;
      f.classList.add("flipping");
      flashLed();
      setTimeout(() => {
        bot.textContent = newV; // 翻牌完成，静态下半片落新值
        f.classList.remove("flipping");
      }, FLAP.HALF_MS * 2 + 30);
    }, delay);
  }
  function flashLed() {
    const led = $("devLed");
    if (!led) return;
    led.classList.remove("flash");
    void led.offsetWidth;
    led.classList.add("flash");
    setTimeout(() => led.classList.remove("flash"), 520);
  }

  /* ————————————————— 时钟驱动 ————————————————— */

  const clock = new TomatoClock();
  const win = $("capsuleWin");

  /* 设备状态栏文案（前段窗口名 / 后段运行状态） */
  const DEV_STATUS = {
    idle: ["EXPEDITION WINDOW", "STANDBY"],
    working: ["EXPEDITION WINDOW", "RUNNING"],
    workPaused: ["EXPEDITION WINDOW", "PAUSED"],
    breaking: ["RECOVERY WINDOW", "RUNNING"],
    breakPaused: ["RECOVERY WINDOW", "PAUSED"],
  };

  /** 进度线：运行中按已耗时比例填充；idle 空；收窗全满转红 */
  function updateProgress() {
    const bar = $("devProgressBar");
    if (!bar) return;
    const t = clock.config.timeLeft ?? 0;
    const total = clock.config.totalTime || clock.config.workTime;
    const state = clock.config.currentState;
    let p = 0;
    if (win.classList.contains("closed")) p = 1;
    else if (state !== "idle" && total > 0) p = Math.max(0, Math.min(1, 1 - t / total));
    bar.style.width = p * 100 + "%";
  }

  /** 设备面板 UI：状态文案 / 按钮显隐与标签 / 进度线（收窗显示期间由 setWindowClosed 全权负责） */
  function applyDeviceUI() {
    if (windowClosedTimer) return;
    const state = clock.config.currentState;
    const st = DEV_STATUS[state] || DEV_STATUS.idle;
    $("devStatusPre").textContent = st[0];
    $("devRun").textContent = st[1];
    $("devStatus").classList.toggle("no-run", false);
    const show = (el, on) => { if (el) el.style.display = on ? "" : "none"; };
    const begin = $("beginBtn"), pause = $("pauseBtn"), stop = $("stopBtn");
    switch (state) {
      case "idle":
        show(begin, true); show(pause, false); show(stop, false);
        break;
      case "working":
        show(begin, false); show(pause, true); show(stop, true);
        pause.textContent = "PAUSE";
        break;
      case "workPaused":
        show(begin, false); show(pause, true); show(stop, true);
        pause.textContent = "RESUME";
        break;
      case "breaking":
        show(begin, false); show(pause, true); show(stop, true);
        pause.textContent = "PAUSE";
        break;
      case "breakPaused":
        show(begin, false); show(pause, true); show(stop, true);
        pause.textContent = "RESUME";
        break;
    }
    updateProgress();
  }

  /** 专注跑满后的「收窗」显示：翻牌停住、状态转低饱和红、WINDOW CLOSED */
  let windowClosedTimer = null;
  function setWindowClosed() {
    win.classList.add("closed");
    $("devStatusPre").textContent = "WINDOW CLOSED";
    $("devRun").textContent = "";
    $("devStatus").classList.add("no-run");
    updateProgress();
    clearTimeout(windowClosedTimer);
    windowClosedTimer = setTimeout(() => {
      // 必须先解锁再刷新：windowClosedTimer 不置 null 会让 applyDeviceUI/onTick/
      // onStateChange 的收窗分支永久生效（历史 bug：专注跑满后翻牌停 00:00、
      // 按钮显隐永不恢复，界面锁死无法操作）
      windowClosedTimer = null;
      win.classList.remove("closed");
      // 补全收窗期间被跳过的完整状态刷新（翻牌落定当前状态时长/按钮显隐/进度线/文案）
      clock.onStateChange();
    }, 2600);
  }

  clock.onTick = function () {
    if (windowClosedTimer) return;                      // 收窗期间翻牌停住
    if (this.config.currentState === "idle") return;    // idle 值由 onStateChange 落定（工作时长）
    const t = this.formatTime();
    syncFlips(t.minutes, t.seconds);
    updateProgress();
  };

  clock.onWorkTick = function () {
    // 仅专注期间投进度（暂停时倒计时停、onTick 不触发，画面随之冻结）
    if (this.config.currentState === "working") growApply(this.config.progress);
  };

  clock.onStateChange = function () {
    const state = this.config.currentState;
    win.classList.remove("idle", "working", "workPaused", "breaking", "breakPaused");
    if (!windowClosedTimer) win.classList.remove("closed");
    win.classList.add(state);
    $("capState").textContent = UI_TEXT.capsuleStateText[state] || "休息中";
    win.classList.toggle("active", state !== "idle");
    if (windowClosedTimer) {
      // 收窗显示期间：翻牌停住、设备面板文案保持 WINDOW CLOSED，仅跟随时钟切后台状态
      refreshAnimationVisible();
      syncTask();
      return;
    }
    switch (state) {
      case "idle":
        this.config.timeLeft = 0;
        {
          const w = this.formatTime(this.config.workTime);
          snapFlips(w.minutes, w.seconds);
        }
        break;
      case "breaking":
      case "breakPaused": {
        // 进入休息：翻牌直接落在休息时长（此时 timeLeft 尚未刷新）
        const bt = this.isLongBreak() ? this.config.longBreakTime : this.config.shortBreakTime;
        const b = this.formatTime(bt);
        snapFlips(b.minutes, b.seconds);
        break;
      }
    }
    applyDeviceUI();
    refreshAnimationVisible();
    syncTask();
    renderTodayStats();
  };

  clock.onWorkEnd = async function () {
    const raw = this.config.progress || 0;
    const full = raw >= 0.99;
    const progress = Math.round(this.config.progress * 10) / 10;
    const duration = this.config.totalTime;
    // 记账口径与主页面 index.js onWorkEnd 一致：progress>0 即落账，番茄个数仍 ≥0.3；
    // 双页防重：主页面与本页各自跑时钟，同一段专注结束时只有先落账的一方记账
    if (progress > 0 && (await tryLockWorkEnd(progress))) {
      const result = addTomatoToTaskInList(getTodoList(), this.config.boundTaskId, duration, progress);
      if (settings.config.showSuccessPopup) {
        if (result.partial) {
          capsuleToast(`专注 ${Math.round((duration * progress) / 60000)} 分钟已记录（不足 30% 未计番茄）`);
        } else {
          capsuleToast(result.title ? UI_TEXT.toastTomatoDone(result.title, result.total) : UI_TEXT.toastTomatoDoneNoTask);
        }
      }
      renderTodayStats();
    }
    // 跑满：设备收窗（WINDOW CLOSED 红态）→ 转红→坠果→冻结完整放映后回种子；
    // 中止：直接回种子。终局放映不阻塞状态切换（对齐主页面 waitEndgameThenCollapse 的 fire-and-forget）
    if (full) {
      setWindowClosed();
      growRip();
      let waited = 0;
      const timer = setInterval(() => {
        waited += 200;
        const st = growState();
        if ((st && st.stage === "frozen") || waited > 12000) {
          clearInterval(timer);
          growReset();
        }
      }, 200);
    } else {
      growReset();
    }
    return Promise.resolve();
  };

  clock.onBreakEnd = async function () {
    // 双页防重：与 onWorkEnd 同一把锁（休息结束同样可能被两页同时触发）
    if (await tryLockWorkEnd(this.config.progress)) {
      const list = getTodoList();
      if (list) {
        recordStatisticsToList(
          list,
          this.isLongBreak() ? this.config.longBreakTime : this.config.shortBreakTime,
          this.isLongBreak() ? "longBreak" : "shortBreak",
          Math.round(this.config.progress * 10) / 10,
          getActiveTaskOf(list)
        );
      }
      if (settings.config.showSuccessPopup) capsuleToast("休息结束");
    }
    return Promise.resolve();
  };

  /* ————————————————— 控制入口 ————————————————— */

  /** 开始专注即锁定绑定当前「在做」任务（与主页面 bindActiveTaskToClock 同口径） */
  function bindActiveTaskToClock() {
    const list = getTodoList();
    const active = list ? getActiveTaskOf(list) : null;
    clock.config.boundTaskId = active && active.id !== -1 ? active.id : -1;
    clock.saveConfig();
    if (clock.config.boundTaskId === -1) capsuleToast(UI_TEXT.toastNoBoundTask);
    syncTask();
  }

  function capsuleBegin() { bindActiveTaskToClock(); clock.begin(); }
  function capsulePause() { clock.pause(); }
  function capsuleContinue() { clock.continue(); }
  function capsuleStop() { clock.stop(); }
  window.capsuleBegin = capsuleBegin;
  window.capsulePause = capsulePause;
  window.capsuleContinue = capsuleContinue;
  window.capsuleStop = capsuleStop;

  $("beginBtn").addEventListener("click", capsuleBegin);
  $("pauseBtn").addEventListener("click", () => {
    if (clock.isPaused()) capsuleContinue();
    else capsulePause();
  });
  $("stopBtn").addEventListener("click", capsuleStop);

  /** 完成「在做」任务（菜单入口；与主页面 compltedActiveTask 同口径） */
  function capsuleDoneTask() {
    const done = completeActiveTaskInList(getTodoList());
    capsuleToast(done ? "已完成，收工" : "没有「在做」的任务");
    syncTask();
    renderTodayStats();
    return done;
  }
  window.capsuleDoneTask = capsuleDoneTask;

  /* ————————————————— 任务与今日统计 ————————————————— */

  function syncTask() {
    const list = getTodoList();
    const focusing = clock.config.currentState === "working" || clock.config.currentState === "workPaused";
    const task = list
      ? focusing
        ? findTaskInList(list, clock.config.boundTaskId)
        : getActiveTaskOf(list)
      : null;
    const title = task && task.id !== -1 ? task.title : "";
    $("capTask").style.display = title ? "" : "none";
    if (!title) { $("capTask").textContent = ""; $("capTask").title = ""; return; }
    // 归属链：有归属的代办显示「计划 > 里程碑 > 代办」，同名代办也分得清；单行超长省略，title 悬停看全
    const chain = milestoneChainOf(list, task);
    const full = chain ? `${chain.planTitle} > ${chain.milestoneTitle} > ${title}` : title;
    $("capTask").textContent = UI_TEXT.focusIdlePrefix + full;
    $("capTask").title = full;
  }

  function renderTodayStats() {
    const s = statisticsTodayNumOf(getTodoList());
    $("todayRed").textContent = s.red;
    $("todayYellow").textContent = s.yellow;
    $("todayMinutes").textContent = s.focusMinutes;
  }

  /* ————————————————— 跨窗口同步（单一源：clockSync.js） ————————————————— */

  installClockStorageSync(clock, {
    onTodoListChange: () => {
      syncTask();
      renderTodayStats();
    },
    onSettingsChange: () => {
      applyTheme();
      applyOpacity();
      refreshAnimationVisible();
    },
  });

  /* ————————————————— 主题与透明度 ————————————————— */

  function applyTheme() {
    const mode = (settings.config && settings.config.darkMode) || "light";
    const dark = mode === "dark" || (mode === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.toggleAttribute("data-theme", dark);
  }

  function applyOpacity() {
    const op = settings.config && settings.config.opacity != null ? settings.config.opacity : 1;
    win.style.opacity = op;
  }

  function toggleDark() {
    settings.config.darkMode = settings.config.darkMode === "dark" ? "light" : "dark";
    settings.saveConfig(settings.config); // 落库 → 主页面 storage 监听同步
    applyTheme();
  }

  /* ————————————————— 拖拽（弹窗窗口级 moveTo） ————————————————— */

  // Tauri 桌面壳下 window.moveTo 无效：首次确认拖动后交给壳层 start_dragging（系统级窗口拖动）
  let tauriDragArmed = true;

  let isDragging = false, startX = 0, startY = 0, hasDragged = false;

  $("capHead").addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".devBtn") || e.target.closest("#menuBtn")) return;
    isDragging = true;
    hasDragged = false;
    tauriDragArmed = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  document.addEventListener(
    "mousemove",
    throttle((e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      if (!hasDragged && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) hasDragged = true;
      if (hasDragged) {
        win.classList.add("dragging");
        const t = window.__TAURI_INTERNALS__;
        if (t && tauriDragArmed) {
          tauriDragArmed = false; // 系统接管后本手势内不再重复调用
          try { t.invoke("plugin:window|start_dragging"); } catch (_) { /* 非 Tauri 环境 */ }
        }
        try { window.moveTo(Math.round(e.screenX - startX), Math.round(e.screenY - startY)); } catch (_) { /* Tauri 下无 moveTo，忽略 */ }
      }
    }, 1000 / 60)
  );

  let posTimer = null;
  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    win.classList.remove("dragging");
    if (hasDragged) {
      if (posTimer) clearTimeout(posTimer);
      posTimer = setTimeout(() => {
        try { store.setItem("desktopCapsulePos", { x: window.screenX, y: window.screenY }); } catch (_) { /* noop */ }
      }, 300);
    }
  });

  // 拖拽后抑制误触的 click（捕获阶段兜底）
  document.addEventListener(
    "click",
    (e) => {
      if (hasDragged) {
        e.stopImmediatePropagation();
        e.preventDefault();
        hasDragged = false;
      }
    },
    true
  );

  (function restorePos() {
    try {
      const pos = store.getItem("desktopCapsulePos");
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
      const sx = window.screen.availWidth || window.screen.width;
      const sy = window.screen.availHeight || window.screen.height;
      const x = Math.min(Math.max(pos.x, 0), Math.max(sx - (window.outerWidth || 300), 0));
      const y = Math.min(Math.max(pos.y, 0), Math.max(sy - (window.outerHeight || 300), 0));
      window.moveTo(Math.round(x), Math.round(y));
    } catch (_) { /* noop */ }
  })();

  /* ————————————————— 菜单 / 打开主界面 / 双击 ————————————————— */

  function openMainWindow() {
    // Tauri 桌面壳：主窗已由壳持有，聚焦它而不是 window.open（否则开出浏览器弹窗成假链路）
    const t = window.__TAURI_INTERNALS__;
    if (t) {
      try { t.invoke("plugin:window|set_focus", { label: "main" }).catch(() => {}); return; } catch (_) { /* fallthrough */ }
    }
    try { window.open("index.html", "_blank"); } catch (_) { /* noop */ }
  }
  window.openMainWindow = openMainWindow;

  const dropdown = $("dropdown");
  function toggleDropdown(show) { dropdown.style.display = show ? "block" : "none"; }

  $("menuBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown(dropdown.style.display === "none");
  });
  document.addEventListener("click", () => toggleDropdown(false));
  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    toggleDropdown(true);
  });

  $("miDone").addEventListener("click", () => { capsuleDoneTask(); toggleDropdown(false); });
  $("miOpen").addEventListener("click", openMainWindow);
  $("miDark").addEventListener("click", () => { toggleDark(); toggleDropdown(false); });
  $("miClose").addEventListener("click", () => {
    toggleDropdown(false);
    // Tauri 桌面壳：close 由壳接管为隐藏（保状态，托盘可再唤出）；浏览器弹窗仍走 window.close
    const t = window.__TAURI_INTERNALS__;
    if (t) {
      try { t.invoke("plugin:window|close", { label: "capsule" }).catch(() => {}); return; } catch (_) { /* fallthrough */ }
    }
    try { window.close(); } catch (_) { /* noop */ }
  });

  document.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMainWindow();
  });

  // 屏蔽快捷键关窗（弹窗常驻）
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "w") e.preventDefault();
    if (e.altKey && e.key === "F4") e.preventDefault();
  });

  // 手动关闭胶囊窗口 → 回写设置开关为关（主页面 storage 监听同步开关 UI）
  window.addEventListener("pagehide", () => {
    try {
      const s = store.getItem("settings");
      if (s && s.showDesktopCapsule) {
        s.showDesktopCapsule = false;
        store.setItem("settings", s);
      }
    } catch (_) { /* noop */ }
  });

  /* ————————————————— 工具 ————————————————— */

  function throttle(fn, delay) {
    let lastTime = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastTime >= delay) { fn.apply(this, args); lastTime = now; }
    };
  }

  let toastTimer = null;
  function capsuleToast(msg) {
    let el = $("capsuleToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "capsuleToast";
      el.className = "capsuleToast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = "none"; }, 1800);
  }

  /* ————————————————— 初始化 ————————————————— */

  // 初始定格：翻牌先落在工作时长（避免开机即整排级联翻动），随后接续跨会话计时
  const w0 = clock.getWorkTime();
  snapFlips(w0.minutes, w0.seconds);
  clock.continueState(); // 接续跨会话计时（含 onStateChange → applyDeviceUI/syncTask/renderTodayStats）
  applyTheme();
  applyOpacity();

  // 调试/验收句柄（CDP 验收脚本用）
  window.__CAPSULE__ = { clock, capGetList: getTodoList, capAddTomatoToTask: (id, d, p) => addTomatoToTaskInList(getTodoList(), id, d, p) };
})();
