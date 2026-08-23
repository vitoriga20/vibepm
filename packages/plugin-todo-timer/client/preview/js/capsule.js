/**
 * capsule.js 桌面胶囊（capsule.html 配套）
 *  - 参照 ztools pomodoro 悬浮胶囊：番茄↔鱼水状态动画、计时控制按钮、当前任务卡完成
 *  - 与主页面共用 localStorage（todo-tomato:*），storage 事件双向同步时钟/任务/设置
 *  - 独立小窗常驻：拖拽移动（moveTo）、位置记忆、右键/⋯菜单、双击开主界面
 *  - 数据层：todoList.js 的统计/完成函数最小副本（本页纯 JS 无法 import，保留副本并注释指向）
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const LIST_KEY = "todoList"; // = todoListManger("todoList") 的存储键（env.js store 已带前缀）

  /* ————————————————— 数据层副本（todoList.js 最小子集） ————————————————— */

  function capGetList() { return store.getItem(LIST_KEY); }
  function capSaveList(list) { store.setItem(LIST_KEY, list); }

  function capFindTask(list, id) {
    if (!list || id == null || id === -1) return null;
    return (
      list.current.find((t) => t.id === id) ||
      list.done.find((t) => t.id === id) ||
      list.archived.find((t) => t.id === id) ||
      null
    );
  }

  /** 「在做」= 显式 active 标志（与 todoList.js getActiveTask 同口径，无兜底 current[0]） */
  function capGetActiveTask(list) {
    const explicit = list.current.find((t) => t.active === true);
    return explicit || list.defaultTask || { id: -1, title: "", tomato: {}, milestoneId: null };
  }

  function capCountTaskTomato(task) {
    if (!task || !task.tomato) return 0;
    return Object.values(task.tomato).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  }

  function capRecordStatistics(list, duration, type, progress, task) {
    const t = task || capGetActiveTask(list);
    list.statistics.push({
      endTimestamp: Date.now(),
      duration,
      realDuration: duration * progress,
      type,
      progress,
      tarId: t.id,
      planRef: t.milestoneId || null,
      title: t.title || "",
    });
    capSaveList(list);
  }

  /** 番茄记账：只要专注过（progress>0 由调用方保证）就落 statistics；番茄个数 ≥0.3 才算 */
  function capAddTomatoToTask(id, duration, progress) {
    const list = capGetList();
    if (!list) return { title: "", total: 0, partial: false };
    const task = capFindTask(list, id);
    capRecordStatistics(list, duration, "work", progress, task || list.defaultTask);
    if (!task || task.id === -1) return { title: "", total: 0, partial: false };
    if (progress >= 0.3) {
      if (!task.tomato) task.tomato = {};
      if (!task.tomato[progress]) task.tomato[progress] = [];
      task.tomato[progress].push(Date.now());
      capSaveList(list);
      return { title: task.title, total: capCountTaskTomato(task), partial: false };
    }
    return { title: task.title, total: capCountTaskTomato(task), partial: true };
  }

  /** 今日番茄数与专注分钟（与 todoList.js statisticsTodayNum 同口径） */
  function capStatisticsTodayNum(list) {
    if (!list) return { red: 0, yellow: 0, focusMinutes: 0 };
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    let red = 0, yellow = 0, totalFocusTime = 0;
    for (let i = list.statistics.length - 1; i >= 0; i--) {
      const item = list.statistics[i];
      if (item.endTimestamp < startOfDay.getTime()) break;
      if (item.type === "work") {
        if (item.progress >= 0.9) red++; else yellow++;
        totalFocusTime += item.realDuration || 0;
      }
    }
    return { red, yellow, focusMinutes: parseFloat((totalFocusTime / MS_PER_MINUTE).toFixed(1)) };
  }

  /** 完成「在做」任务（移到 done 列表，与 compltedActiveTask 同口径） */
  function capCompleteActiveTask() {
    const list = capGetList();
    if (!list) return false;
    const t = capGetActiveTask(list);
    if (t.id === -1) return false;
    list.current = list.current.filter((x) => x.id !== t.id);
    t.doneTimestamp = Date.now();
    list.done.push(t);
    capSaveList(list);
    return true;
  }

  /** 任务所属里程碑标题（用于胶囊上的 #标签） */
  function capMilestoneLabel(list, task) {
    if (!list || !task || !task.milestoneId) return "";
    const plans = list.plans || [];
    for (const plan of plans) {
      const ms = (plan.milestones || []).find((m) => m.id === task.milestoneId);
      if (ms) return ms.title;
    }
    return "";
  }

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
    // 记账口径与主页面 index.js onWorkEnd 一致：progress>0 即落账，番茄个数仍 ≥0.3
    // 双页防重：主页面与胶囊页各自跑时钟，同一段专注结束时只有先落账的一方记账
    if (progress > 0 && capTryLockWorkEnd(progress)) {
      const result = capAddTomatoToTask(this.config.boundTaskId, duration, progress);
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
    if (capTryLockWorkEnd(this.config.progress)) {
      const list = capGetList();
      if (list) {
        capRecordStatistics(
          list,
          this.isLongBreak() ? this.config.longBreakTime : this.config.shortBreakTime,
          this.isLongBreak() ? "longBreak" : "shortBreak",
          Math.round(this.config.progress * 10) / 10,
          capGetActiveTask(list)
        );
      }
      if (settings.config.showSuccessPopup) capsuleToast("休息结束");
    }
    return Promise.resolve();
  };

  /**
   * 双页记账互斥锁：任一页落账后 5s 内，另一页同进度结束不重复记账。
   * 锁本身走 localStorage（todo-tomato:workEndLock），无监听器 → 不会引发同步乒乓。
   */
  function capTryLockWorkEnd(progress) {
    try {
      const now = Date.now();
      const lock = store.getItem("workEndLock");
      if (lock && now - lock.ts < 5000 && Math.abs(lock.progress - progress) < 0.01) return false;
      store.setItem("workEndLock", { ts: now, progress });
      return true;
    } catch (_) {
      return true;
    }
  }

  /* ————————————————— 控制入口 ————————————————— */

  /** 开始专注即锁定绑定当前「在做」任务（与主页面 bindActiveTaskToClock 同口径） */
  function bindActiveTaskToClock() {
    const list = capGetList();
    const active = list ? capGetActiveTask(list) : null;
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
    const done = capCompleteActiveTask();
    capsuleToast(done ? "已完成，收工" : "没有「在做」的任务");
    syncTask();
    renderTodayStats();
  }
  window.capsuleDoneTask = capsuleDoneTask;

  /* ————————————————— 任务卡与状态栏 ————————————————— */

  function syncTask() {
    const list = capGetList();
    const focusing = clock.config.currentState === "working" || clock.config.currentState === "workPaused";
    const task = list
      ? focusing
        ? capFindTask(list, clock.config.boundTaskId)
        : capGetActiveTask(list)
      : null;
    const title = task && task.id !== -1 ? task.title : "";
    $("taskTitle").textContent = title || "行到水穷处，坐看云起时";
    $("completeButton").style.display = task && task.id !== -1 ? "flex" : "none";
    const tag = task && task.id !== -1 ? capMilestoneLabel(list, task) : "";
    $("tag").textContent = tag ? "#" + tag : "";
    $("tag").style.display = tag ? "" : "none";
  }

  function renderTodayStats() {
    const s = capStatisticsTodayNum(capGetList());
    $("todayRed").textContent = s.red;
    $("todayYellow").textContent = s.yellow;
    $("todayMinutes").textContent = s.focusMinutes;
  }

  /* ————————————————— 跨窗口同步（主页面 ↔ 胶囊） ————————————————— */
  // 只读重载 + 纯展示计时器：接收方不清零、不重建倒计时（避免两页各自跑结束流程互相踩），
  // 直接用保存的 endTime 推算剩余时间展示；到点统一走 switchState（记账有锁防重）。
  function resyncClock() {
    const saved = store.getItem("clock");
    if (!saved) return;
    clock.config = { ...clock.defaultConfig, ...saved };
    if (clock.timer) { clearInterval(clock.timer); clock.timer = null; } // 清掉任何残留本地倒计时
    const st = clock.config.currentState;
    if (st === "working" || st === "breaking") {
      clock.config.pauseTimeFlag = false;
      clock.config.pauseLeftTime = 0;
      // 过渡态落盘先于 countdown 刷新 endTime：刚切换的保存常带上一段已过期 endTime。
      // 若缺失/已过期 → 按当前状态重算整段时长，避免接收方瞬间误判结束引发双向连锁。
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
          clock.switchState(); // 统一结束流程；记账锁保证只有一方落账
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
  }

  window.addEventListener("storage", (e) => {
    if (!e.key) return;
    if (e.key === "todo-tomato:clock") {
      resyncClock();
    } else if (e.key === "todo-tomato:todoList") {
      syncTask();
      renderTodayStats();
    } else if (e.key === "todo-tomato:settings") {
      const s = store.getItem("settings");
      settings.config = { ...settings.defaultConfig, ...(s || {}) };
      applyTheme();
      applyOpacity();
    }
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
  window.__CAPSULE__ = { clock, setTomato, capGetList, capAddTomatoToTask };
})();
