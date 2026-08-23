/**
 * capsule.js 桌面胶囊（capsule.html 配套）
 *  - 参照 ztools pomodoro 悬浮胶囊：番茄↔鱼水状态动画、计时控制按钮、当前任务卡完成
 *  - 数据层走 todoData.js 单一源；跨窗同步走 clockSync.js 单一源（主页面同样接入）
 *  - 独立小窗常驻：拖拽移动（moveTo）、位置记忆、右键/⋯菜单、双击开主界面
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  /* ————————————————— 番茄生长（参考 ztools changeColor.js + floatingWindow index.js） ————————————————— */

  function hexToRgb(hex) {
    return [parseInt(hex.substring(1, 3), 16), parseInt(hex.substring(3, 5), 16), parseInt(hex.substring(5, 7), 16)];
  }
  function rgbToHex(r, g, b) {
    const toHex = (x) => { const s = x.toString(16); return s.length === 1 ? "0" + s : s; };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }
  function getGradientColor(colors, positions, currentPosition) {
    if (currentPosition <= 0) return colors[0];
    if (currentPosition >= 1) return colors[colors.length - 1];
    for (let i = 0; i < positions.length - 1; i++) {
      if (currentPosition >= positions[i] && currentPosition <= positions[i + 1]) {
        const ratio = (currentPosition - positions[i]) / (positions[i + 1] - positions[i]);
        const [r1, g1, b1] = hexToRgb(colors[i]);
        const [r2, g2, b2] = hexToRgb(colors[i + 1]);
        return rgbToHex(
          Math.round(r1 + (r2 - r1) * ratio),
          Math.round(g1 + (g2 - g1) * ratio),
          Math.round(b1 + (b2 - b1) * ratio)
        );
      }
    }
    return colors[colors.length - 1];
  }

  const bornSize = 0.4;
  function setTomato(progress) {
    const centerX = 30, centerY = 12;
    const scale = (1 - bornSize - 0.2) * progress + bornSize;
    const body = $("tomatoBody");
    const fill = $("tomatoFill");
    if (!body || !fill) return;
    body.setAttribute("transform", `translate(${(1 - scale) * centerX}, ${(1 - scale) * centerY}) scale(${scale})`);
    fill.setAttribute("fill", getGradientColor(["#7ABE6F", "#FFD12C", "#FC5E3C"], [0, 0.5, 1], progress.toFixed(2)));
    fill.setAttribute("stroke", getGradientColor(["#0D9D00", "#EEAF50", "#FFBE5D"], [0, 0.5, 1], progress.toFixed(2)));
    body.setAttribute("opacity", 1);
  }

  /* ————————————————— 时钟驱动 ————————————————— */

  const clock = new TomatoClock();
  let lastProgress = 0;

  clock.onTick = function () {
    const t = this.formatTime();
    $("minutes").textContent = t.minutes;
    $("seconds").textContent = t.seconds;
  };

  clock.onWorkTick = function () {
    if (this.config.progress !== lastProgress) {
      lastProgress = this.config.progress;
      setTomato(this.config.progress);
    }
  };

  clock.onStateChange = function () {
    const state = this.config.currentState;
    const show = (el, on) => { if (el) el.style.display = on ? "flex" : "none"; };
    const mainBar = $("mainBar");
    const timerNum = $("timerNum");
    const timerBox = $("timerBox");
    const controlBox = $("controlBox");
    switch (state) {
      case "idle":
        setTomato(0);
        show($("tomatoBox"), true);
        show($("breakIcon"), false);
        if (timerNum) timerNum.style.display = "none";
        show(controlBox, true);
        if (timerBox) timerBox.classList.add("idle");
        show($("beginBtn"), true);
        show($("pauseBtn"), false);
        show($("continueBtn"), false);
        show($("stopBtn"), false);
        show($("todoBox"), true);
        if (mainBar) mainBar.classList.remove("break");
        break;
      case "working":
        show($("tomatoBox"), true);
        show($("breakIcon"), false);
        if (timerBox) timerBox.classList.remove("idle");
        if (timerNum) timerNum.style.display = "block";
        if (controlBox) controlBox.style.display = ""; // 还原（show 的空串语义是隐藏）
        show($("beginBtn"), false);
        show($("pauseBtn"), true);
        show($("continueBtn"), false);
        show($("stopBtn"), true);
        show($("todoBox"), true);
        if (mainBar) mainBar.classList.remove("break");
        break;
      case "workPaused":
        setTomato(this.config.progress || 0);
        if (timerNum) timerNum.style.display = "block";
        show($("beginBtn"), false);
        show($("pauseBtn"), false);
        show($("continueBtn"), true);
        show($("stopBtn"), true);
        break;
      case "breaking":
        show($("tomatoBox"), false);
        show($("breakIcon"), true);
        if (timerNum) timerNum.style.display = "block";
        show($("beginBtn"), false);
        show($("pauseBtn"), true);
        show($("continueBtn"), false);
        show($("stopBtn"), true);
        if (mainBar) mainBar.classList.add("break");
        show($("todoBox"), false);
        break;
      case "breakPaused":
        show($("tomatoBox"), false);
        show($("breakIcon"), true);
        if (timerNum) timerNum.style.display = "block";
        show($("beginBtn"), false);
        show($("pauseBtn"), false);
        show($("continueBtn"), true);
        show($("stopBtn"), true);
        if (mainBar) mainBar.classList.add("break");
        break;
    }
    syncTask();
    renderTodayStats();
  };

  function tomatoFallingAni() {
    return new Promise((resolve) => {
      const tomato = $("tomato");
      tomato.classList.remove("tomatoSwing");
      tomato.classList.add("tomatoFalling");
      setTimeout(() => {
        tomato.classList.remove("tomatoFalling");
        tomato.classList.add("tomatoSwing");
        resolve();
      }, 1000);
    });
  }

  clock.onWorkEnd = async function () {
    const raw = this.config.progress || 0;
    const full = raw >= 0.99;
    const progress = Math.round(this.config.progress * 10) / 10;
    const duration = this.config.totalTime;
    // 记账口径与主页面 index.js onWorkEnd 一致：progress>0 即落账，番茄个数仍 ≥0.3；
    // 双页防重：主页面与本页各自跑时钟，同一段专注结束时只有先落账的一方记账
    if (progress > 0 && tryLockWorkEnd(progress)) {
      const result = addTomatoToTaskInList(getTodoList(), this.config.boundTaskId, duration, progress);
      if (settings.config.showSuccessPopup) {
        if (result.partial) {
          capsuleToast(`专注 ${Math.round((duration * progress) / 60000)} 分钟已记录（不足 30% 未计番茄）`);
        } else {
          capsuleToast(result.title ? `专注完成，番茄 +1 ·「${result.title}」累计 ${result.total} 个` : "专注完成，番茄 +1（未绑定任务）");
        }
      }
      renderTodayStats();
    }
    // 跑满：转红→坠果→回种子；中止：直接回种子
    if (full) await tomatoFallingAni();
    else setTomato(0);
    return Promise.resolve();
  };

  clock.onBreakEnd = async function () {
    // 双页防重：与 onWorkEnd 同一把锁（休息结束同样可能被两页同时触发）
    if (tryLockWorkEnd(this.config.progress)) {
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
    if (clock.config.boundTaskId === -1) capsuleToast("本次专注未绑定任务：可先在待办里把一条设为在做");
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

  function capsuleDoneTask() {
    const done = completeActiveTaskInList(getTodoList());
    capsuleToast(done ? "已完成，收工" : "没有「在做」的任务");
    syncTask();
    renderTodayStats();
  }
  window.capsuleDoneTask = capsuleDoneTask;

  /* ————————————————— 任务卡与状态栏 ————————————————— */

  function syncTask() {
    const list = getTodoList();
    const focusing = clock.config.currentState === "working" || clock.config.currentState === "workPaused";
    const task = list
      ? focusing
        ? findTaskInList(list, clock.config.boundTaskId)
        : getActiveTaskOf(list)
      : null;
    const title = task && task.id !== -1 ? task.title : "";
    $("taskTitle").textContent = title || "行到水穷处，坐看云起时";
    $("completeButton").style.display = task && task.id !== -1 ? "flex" : "none";
    const tag = task && task.id !== -1 ? milestoneLabelOf(list, task) : "";
    $("tag").textContent = tag ? "#" + tag : "";
    $("tag").style.display = tag ? "" : "none";
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
    },
  });

  /* ————————————————— 主题与透明度 ————————————————— */

  function applyTheme() {
    const mode = (settings.config && settings.config.darkMode) || "light";
    const dark = mode === "dark" || (mode === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.toggleAttribute("data-theme", dark);
    document.body.classList.toggle("dark", dark);
  }

  function applyOpacity() {
    const op = settings.config && settings.config.opacity != null ? settings.config.opacity : 1;
    $("main").style.opacity = op;
  }

  function toggleDark() {
    settings.config.darkMode = settings.config.darkMode === "dark" ? "light" : "dark";
    settings.saveConfig(settings.config); // 落库 → 主页面 storage 监听同步
    applyTheme();
  }

  /* ————————————————— 拖拽（弹窗窗口级 moveTo） ————————————————— */

  const dragRegion = $("mainBar");
  let isDragging = false, startX = 0, startY = 0, hasDragged = false;

  dragRegion.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".button") || e.target.closest("#completeButton") || e.target.closest("#menuBtn")) return;
    isDragging = true;
    hasDragged = false;
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
        try { window.moveTo(Math.round(e.screenX - startX), Math.round(e.screenY - startY)); } catch (_) { /* 非弹窗环境忽略 */ }
      }
    }, 1000 / 60)
  );

  let posTimer = null;
  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    if (hasDragged) {
      if (posTimer) clearTimeout(posTimer);
      posTimer = setTimeout(() => {
        try { store.setItem("desktopCapsulePos", { x: window.screenX, y: window.screenY }); } catch (_) { /* noop */ }
      }, 300);
    }
  });

  // 拖拽后抑制误触的 click（冒泡阶段兜底）
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
      const x = Math.min(Math.max(pos.x, 0), Math.max(sx - (window.outerWidth || 360), 0));
      const y = Math.min(Math.max(pos.y, 0), Math.max(sy - (window.outerHeight || 80), 0));
      window.moveTo(Math.round(x), Math.round(y));
    } catch (_) { /* noop */ }
  })();

  /* ————————————————— 菜单 / 打开主界面 / 双击 / 光标 ————————————————— */

  function openMainWindow() {
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

  $("miOpen").addEventListener("click", openMainWindow);
  $("miDark").addEventListener("click", () => { toggleDark(); toggleDropdown(false); });
  $("miClose").addEventListener("click", () => {
    toggleDropdown(false);
    try { window.close(); } catch (_) { /* noop */ }
  });

  document.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMainWindow();
  });

  // 动画区跟随光标：专注=太阳旋转，休息=手
  const aniBox = $("aniBox");
  const cursor = $("animatedCursor");
  aniBox.addEventListener("mousemove", (e) => {
    cursor.style.left = e.pageX + "px";
    cursor.style.top = e.pageY + "px";
  });
  aniBox.addEventListener("mouseenter", () => {
    if ($("mainBar").classList.contains("break")) {
      cursor.src = "pic/hand.svg";
      cursor.style.animation = "";
    } else {
      cursor.src = "pic/sun.svg";
      cursor.style.animation = "cursorAnimation2 2.5s linear infinite";
    }
    cursor.style.display = "block";
  });
  aniBox.addEventListener("mouseleave", () => { cursor.style.display = "none"; });

  // 屏蔽快捷键关窗（弹窗常驻）
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "w") e.preventDefault();
    if (e.altKey && e.key === "F4") e.preventDefault();
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

  $("tomatoBox").style.display = "block";
  setTomato(0);
  clock.continueState(); // 接续跨会话计时（含 onStateChange → syncTask/renderTodayStats）
  applyTheme();
  applyOpacity();

  // 调试/验收句柄（CDP 验收脚本用）
  window.__CAPSULE__ = { clock, setTomato, capGetList: getTodoList, capAddTomatoToTask: (id, d, p) => addTomatoToTaskInList(getTodoList(), id, d, p) };
})();
