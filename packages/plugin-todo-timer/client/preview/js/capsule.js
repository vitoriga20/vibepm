/**
 * capsule.js 桌面胶囊页（胶囊条 + 盆栽，capsule.html 配套）
 *  - 独立 TomatoClock 实例：continueState 接续持久化状态（展示计时单一源 runDisplayTimer），
 *    跨窗联动走 clockSync.js 单一源；到点记账 tryLockWorkEnd 选举防双窗重复（与主页面同口径）
 *  - 可见性闸门（S8 拍板）：壳环境启动读 settings.showDesktopCapsule 自判定 + storage 事件联动
 *    invoke show/hide；浏览器 popup 生命周期由主页面开关驱动（index.js openDesktopCapsule）
 *  - 交互：胶囊条拖拽（Tauri 交壳 start_dragging / 浏览器由 growBridge 页内拖）、
 *    双击胶囊条开主窗、× 关闭并回写开关=false、pagehide 回写（浏览器手动关窗）
 *  - 位置记忆：desktopCapsulePos（store 键）低频轮询保存 + 启动恢复
 *  - 设置消费：透明度 / 生长动画 / 专注时隐藏 / darkMode（主页面浮层退役后，盆栽与透明度归本页）
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const IS_TAURI = !!(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
  const SETTINGS_FULL_KEY = "todo-tomato:settings"; // env.js store 包装后的全键名（storage 事件匹配必须用全键）
  const capWin = $("growWin");

  /* ————————————————— 盆栽桥：growBridge.js 已加载（growWin/growHead/tomatoLife 同 id） ————————————————— */
  /* 胶囊页只看盆栽本体：viewBox 裁剪放大（growBridge 注入铺满样式后叠加本裁剪） */
  const tomatoIframe = $("tomatoLife");
  tomatoIframe.addEventListener("load", () => {
    const doc = tomatoIframe.contentDocument;
    if (!doc) return;
    const scene = doc.getElementById("scene");
    if (scene) scene.setAttribute("viewBox", "290 90 390 560");
  });
  const grow = () => window.growBridge;

  /* ————————————————— 设置与主题 ————————————————— */

  // 复用 env.js 的全局 settings 实例（clockSync 的跨窗写回挂在该实例上，另 new 会脱钩）

  function applyTheme() {
    const mode = (settings.config && settings.config.darkMode) || "light";
    const dark = mode === "dark" ||
      (mode === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.toggleAttribute("data-theme", dark);
  }

  function applyOpacity() {
    const op = settings.config && settings.config.opacity != null ? settings.config.opacity : 1;
    capWin.style.opacity = op;
  }

  /** 生长动画可见性：尊重「生长动画」开关与「专注时隐藏」（与主页面旧 refresh 同口径） */
  function refreshAnimationVisible() {
    const st = clock.config.currentState;
    const on = settings.config.showTomatoAnimation !== false &&
      !(settings.config.autoHideAni && st === "working");
    const showAnim = on && (st === "working" || st === "workPaused" ||
      ((st === "breaking" || st === "breakPaused") && clock.endgamePlaying));
    tomatoIframe.style.display = showAnim ? "block" : "none";
  }

  /* ————————————————— 胶囊条 UI ————————————————— */

  function syncPill() {
    const st = clock.config.currentState;
    $("growState").textContent = UI_TEXT.capsuleStateText[st] || "休息中";
    capWin.classList.toggle("active", st !== "idle");
    if (st === "idle") {
      $("growTime").textContent = clock.formatTime(clock.config.workTime).minutes + " min";
    } else {
      const t = clock.formatTime();
      $("growTime").textContent = t.minutes + ":" + t.seconds;
    }
  }

  /** 专注任务名（归属链口径与主页面 syncFocusTask 一致） */
  function syncTask() {
    const list = getTodoList();
    const focusing = clock.config.currentState === "working" || clock.config.currentState === "workPaused";
    const task = list
      ? focusing
        ? findTaskInList(list, clock.config.boundTaskId)
        : getActiveTaskOf(list)
      : null;
    const title = task && task.id !== -1 ? task.title : "";
    const el = $("pill-task");
    el.style.display = title ? "" : "none";
    if (!title) { el.textContent = ""; el.title = ""; return; }
    const chain = milestoneChainOf(list, task);
    const full = chain ? `${chain.planTitle} > ${chain.milestoneTitle} > ${title}` : title;
    el.textContent = UI_TEXT.focusIdlePrefix + full;
    el.title = full;
  }

  function capsuleToast(msg) {
    const el = document.createElement("div");
    el.className = "capsule-toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  /* ————————————————— 时钟（独立实例，记账与主页面互斥防重） ————————————————— */

  const clock = new TomatoClock();

  clock.onTick = function () {
    syncPill();
    if (this.config.currentState === "working") grow().apply(this.config.progress);
  };

  clock.onStateChange = function () {
    syncPill();
    syncTask();
    refreshAnimationVisible();
  };

  clock.onWorkEnd = async function () {
    const raw = this.config.progress || 0;
    const full = raw >= 0.99;   // 原始进度判跑满，避免 round 损耗
    const progress = Math.round(this.config.progress * 10) / 10;
    const duration = this.config.totalTime;
    // 记账口径与主页面一致：progress>0 即落账，番茄个数仍 ≥30% 门槛；双窗同刻到点仅先落账方记账
    if (progress > 0 && (await tryLockWorkEnd(progress))) {
      const result = addTomatoToTaskInList(getTodoList(), this.config.boundTaskId, duration, progress);
      if (settings.config.showSuccessPopup) {
        if (result.partial) {
          capsuleToast(`专注 ${Math.round((duration * progress) / 60000)} 分钟已记录（不足 30% 未计番茄）`);
        } else {
          capsuleToast(result.title ? UI_TEXT.toastTomatoDone(result.title, result.total) : UI_TEXT.toastTomatoDoneNoTask);
        }
      }
    }
    if (full) {
      // 跑满：转红→坠果→冻结完整放映后回种子（fire-and-forget，不阻塞状态切换）
      this.endgamePlaying = true;
      grow().rip();
      let waited = 0;
      const timer = setInterval(() => {
        waited += 200;
        const st = grow().state();
        if ((st && st.stage === "frozen") || waited > 12000) {
          clearInterval(timer);
          this.endgamePlaying = false;
          grow().reset();
          refreshAnimationVisible();
        }
      }, 200);
    } else {
      grow().reset();
    }
    return Promise.resolve();
  };

  clock.onBreakEnd = async function () {
    // 双窗防重：与 onWorkEnd 同一把锁（休息结束同样可能被两页同时触发）
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

  /* ————————————————— 跨窗联动（单一源 clockSync.js） ————————————————— */

  installClockStorageSync(clock, {
    onClockResync: () => syncPill(),
    onTodoListChange: () => syncTask(),
    onSettingsChange: () => {
      applyTheme();
      applyOpacity();
      refreshAnimationVisible();
      syncPill();
    },
  });

  /* ————————————————— 壳交互（拖拽 / 双击开主窗 / × / 可见性闸门 / 位置记忆） ————————————————— */

  function openMainWindow() {
    if (IS_TAURI) {
      // remote 窗不允许调用 app 自定义命令（show_main_window 是岛=一方 URL 专用）→
      // 走核心窗口命令链（capability remote-web 已含 show/unminimize/set-focus）：收纳态复显=show+unminimize+focus
      const t = window.__TAURI_INTERNALS__;
      try {
        t.invoke("plugin:window|show", { label: "main" })
          .then(() => t.invoke("plugin:window|unminimize", { label: "main" }).catch(() => {}))
          .then(() => t.invoke("plugin:window|set_focus", { label: "main" }).catch(() => {}))
          .catch(() => {});
      } catch (_) { /* fallthrough */ }
      return;
    }
    try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (_) { /* noop */ }
  }

  /** Tauri 拖拽接管：胶囊条 >4px 手势确认后交壳 start_dragging（系统级窗口拖动） */
  if (IS_TAURI) {
    const head = $("growHead");
    head.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".pill-close")) return;
      const sx = e.clientX, sy = e.clientY;
      let armed = false;
      const onMove = (ev) => {
        if (armed) return;
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) {
          armed = true;
          cleanup();
          try { window.__TAURI_INTERNALS__.invoke("plugin:window|start_dragging"); } catch (_) { /* 非 Tauri 环境 */ }
        }
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", cleanup);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", cleanup);
    });
  }

  $("growHead").addEventListener("dblclick", (e) => {
    if (e.target.closest(".pill-close")) return;
    openMainWindow();
  });

  $("capsuleClose").addEventListener("click", () => {
    // 关闭=收起并回写开关=false（壳内 hide 不触发 pagehide，必须在动作里落盘；
    // 主页面 storage 监听同步设置页开关 UI）
    if (settings.config.showDesktopCapsule) {
      settings.config.showDesktopCapsule = false;
      settings.saveConfig(settings.config);
    }
    if (IS_TAURI) {
      try { window.__TAURI_INTERNALS__.invoke("plugin:window|hide", { label: "capsule" }).catch(() => {}); } catch (_) { /* fallthrough */ }
    } else {
      window.close();
    }
  });

  /** 可见性闸门（仅壳环境）：开关驱动窗体 show/hide；显示时顺带恢复记忆位置
   *  （set_position 须在窗口可见后调用才可靠——启动时 hidden 态恢复会被忽略） */
  function gate() {
    if (!IS_TAURI) return;
    const on = !!(settings.config && settings.config.showDesktopCapsule);
    try {
      if (on) {
        window.__TAURI_INTERNALS__.invoke("plugin:window|show", { label: "capsule" })
          .then(() => restorePos())
          .catch(() => {});
      } else {
        window.__TAURI_INTERNALS__.invoke("plugin:window|hide", { label: "capsule" }).catch(() => {});
      }
    } catch (_) { /* noop */ }
  }
  if (IS_TAURI) {
    window.addEventListener("storage", (e) => {
      if (e.key === SETTINGS_FULL_KEY) gate();
    });
  }

  /** 位置记忆：启动恢复 + 低频轮询保存（Tauri 走 outer_position 精确坐标） */
  const POS_KEY = "desktopCapsulePos";
  function readPos() { try { return store.getItem(POS_KEY); } catch (_) { return null; } }
  function savePos(x, y) { try { store.setItem(POS_KEY, { x, y }); } catch (_) { /* noop */ } }
  function restorePos() {
    if (!IS_TAURI) return;
    const pos = readPos();
    if (!pos || typeof pos.x !== "number") return;
    // 本 Tauri 版命令实参形状（registry 源码 setter! 宏 + CDP 探针实测）：value 为 externally-tagged Position
    try { window.__TAURI_INTERNALS__.invoke("plugin:window|set_position", { label: "capsule", value: { Physical: { x: pos.x, y: pos.y } } }).catch(() => {}); } catch (_) { /* noop */ }
  }
  function pollPos() {
    if (IS_TAURI) {
      try {
        window.__TAURI_INTERNALS__.invoke("plugin:window|outer_position", { label: "capsule" })
          .then((p) => {
            if (p && typeof p.x === "number") {
              const prev = readPos();
              if (!prev || prev.x !== p.x || prev.y !== p.y) savePos(p.x, p.y);
            }
          })
          .catch(() => {});
      } catch (_) { /* noop */ }
      return;
    }
    const x = window.screenX, y = window.screenY;
    if (typeof x === "number" && typeof y === "number" && (x || y)) {
      const prev = readPos();
      if (!prev || prev.x !== x || prev.y !== y) savePos(x, y);
    }
  }

  // 手动关窗（浏览器 popup 被系统关闭）→ 回写开关=关（壳内 hide 不触发 pagehide，× 按钮已显式回写）
  window.addEventListener("pagehide", () => {
    try {
      const raw = localStorage.getItem(SETTINGS_FULL_KEY);
      const s = raw && JSON.parse(raw);
      if (s && s.showDesktopCapsule) {
        s.showDesktopCapsule = false;
        localStorage.setItem(SETTINGS_FULL_KEY, JSON.stringify(s));
      }
    } catch (_) { /* noop */ }
  });

  /* ————————————————— 启动 ————————————————— */

  applyTheme();
  applyOpacity();
  clock.continueState(); // 接续持久化状态（展示计时单一源，不重建倒计时）
  syncPill();
  syncTask();
  refreshAnimationVisible();
  gate();                // 壳环境按当前开关自判定显隐（开=show+恢复记忆位置；默认关=启动即 hide）
  setInterval(pollPos, 1800);
})();
