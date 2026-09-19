/**
 * capsule.js 桌面胶囊页（胶囊条 + 工业翻牌计时表 + 盆栽，capsule.html 配套）
 *  - 独立 TomatoClock 实例：continueState 接续持久化状态（展示计时单一源 runDisplayTimer），
 *    跨窗联动走 clockSync.js 单一源；到点记账 tryLockWorkEnd 选举防双窗重复（与主页面同口径）
 *  - 翻牌引擎（FLAP/snapFlips/syncFlips/flipDigit）与设备面板驱动（applyDeviceUI/进度线/控制按钮）
 *    自旧大胶囊（S9 退役前）源级找回；收窗「WINDOW CLOSED」放映不回归（盆栽终局承担收尾演出）
 *  - 可见性闸门（S8 拍板）：壳环境启动读 settings.showDesktopCapsule 自判定 + storage 事件联动
 *    invoke show/hide；浏览器 popup 生命周期由主页面开关驱动（index.js openDesktopCapsule）
 *  - 交互：胶囊条拖拽（Tauri 交壳 start_dragging / popup=OS 标题栏）、双击胶囊条开主窗、
 *    × 关闭并回写开关=false、pagehide 回写（浏览器手动关窗）
 *  - 位置记忆：desktopCapsulePos（store 键）低频轮询保存 + 显示后恢复
 *  - 设置消费：透明度 / 生长动画 / 专注时隐藏 / darkMode（主页面浮层退役后，本页为唯一消费者）
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const IS_TAURI = !!(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
  const SETTINGS_FULL_KEY = "todo-tomato:settings"; // env.js store 包装后的全键名（storage 事件匹配必须用全键）
  const capWin = $("capsuleWin");

  /* ————————————————— [capsule-debug] 诊断日志（store 键持久化，主窗/CDP 可读；同 [smtc-debug] 策略） ————————————————— */
  function dbg(msg) {
    try {
      const lines = store.getItem("capsuleDbg") || [];
      lines.push(new Date().toISOString().slice(11, 23) + " " + msg);
      store.setItem("capsuleDbg", lines.slice(-60));
    } catch (_) { /* noop */ }
    try { console.log("[capsule]", msg); } catch (_) { /* noop */ }
  }
  window.addEventListener("error", (e) => dbg("PAGE-ERROR " + (e.message || "?") + " @" + (e.filename || "?") + ":" + (e.lineno || "?")));
  window.addEventListener("unhandledrejection", (e) => dbg("REJECT " + String(e.reason)));

  /* ————————————————— 盆栽桥：growBridge.js 已加载（tomatoLife 同 id） ————————————————— */
  /* 胶囊页只看盆栽主体：viewBox 裁剪放大（growBridge 注入铺满样式后叠加本裁剪）。
     框 x315~675 / y130~640：顶含顶芽毛(~138)、底含盆底弧(~616)与终局落叶落点(~624)，
     左含 A 枝叶尖(~322)、右含 100% 暖金光晕缘(~668)；比例 360:510 贴近 iframe 300:170 减少两侧留白 */
  const tomatoIframe = $("tomatoLife");
  tomatoIframe.addEventListener("load", () => {
    const doc = tomatoIframe.contentDocument;
    if (!doc) return;
    const scene = doc.getElementById("scene");
    if (scene) scene.setAttribute("viewBox", "315 130 360 510");
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

  /* ————————————————— 胶囊条（头部） ————————————————— */

  function syncPill() {
    const st = clock.config.currentState;
    $("growState").textContent = UI_TEXT.capsuleStateText[st] || "休息中";
    capWin.classList.toggle("active", st !== "idle");
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

  /* ————————————————— 工业翻牌倒计时显示（机械记牌器，自旧大胶囊源级找回） —————————————————
     每块数字 .flap 内 4 个半片：静态上/下半片 + 临时折叠片/翻起片（时序与样式见 flap.css）。
     syncFlips 只翻变化的那位；分钟进位时多位按右→左级差依次翻；翻牌瞬间整块压暗+运行灯闪一次。 */
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

  /* ————————————————— 设备面板 UI（状态文案 / 按钮显隐 / 进度线） ————————————————— */

  const DEV_STATUS = {
    idle: ["EXPEDITION WINDOW", "STANDBY"],
    working: ["EXPEDITION WINDOW", "RUNNING"],
    workPaused: ["EXPEDITION WINDOW", "PAUSED"],
    breaking: ["RECOVERY WINDOW", "RUNNING"],
    breakPaused: ["RECOVERY WINDOW", "PAUSED"],
  };

  /** 进度线：运行中按已耗时比例填充；idle 空 */
  function updateProgress() {
    const bar = $("devProgressBar");
    if (!bar) return;
    const t = clock.config.timeLeft ?? 0;
    const total = clock.config.totalTime || clock.config.workTime;
    const state = clock.config.currentState;
    let p = 0;
    if (state !== "idle" && total > 0) p = Math.max(0, Math.min(1, 1 - t / total));
    bar.style.width = p * 100 + "%";
  }

  function applyDeviceUI() {
    const state = clock.config.currentState;
    const st = DEV_STATUS[state] || DEV_STATUS.idle;
    $("devStatusPre").textContent = st[0];
    $("devRun").textContent = st[1];
    const show = (el, on) => { if (el) el.style.display = on ? "" : "none"; };
    const begin = $("beginBtn"), pause = $("pauseBtn"), stop = $("stopBtn");
    switch (state) {
      case "idle":
        show(begin, true); show(pause, false); show(stop, false);
        break;
      case "working":
      case "breaking":
        show(begin, false); show(pause, true); show(stop, true);
        pause.textContent = "PAUSE";
        break;
      case "workPaused":
      case "breakPaused":
        show(begin, false); show(pause, true); show(stop, true);
        pause.textContent = "RESUME";
        break;
    }
    updateProgress();
  }

  /* ————————————————— 时钟（独立实例，记账与主页面互斥防重） ————————————————— */

  const clock = new TomatoClock();

  clock.onTick = function () {
    syncPill();
    const t = this.formatTime();
    syncFlips(t.minutes, t.seconds);
    updateProgress();
    if (this.config.currentState === "working") grow().apply(this.config.progress);
  };

  clock.onStateChange = function () {
    const state = this.config.currentState;
    capWin.classList.remove("idle", "working", "workPaused", "breaking", "breakPaused");
    capWin.classList.add(state);
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
    syncPill();
    applyDeviceUI();
    refreshAnimationVisible();
    syncTask();
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

  /* ————————————————— 控制入口（胶囊上直接控钟，跨窗状态由 clockSync 广播） ————————————————— */

  /** 开始专注即锁定绑定当前「在做」任务（与主页面 bindActiveTaskToClock 同口径） */
  function bindActiveTaskToClock() {
    const list = getTodoList();
    const active = list ? getActiveTaskOf(list) : null;
    clock.config.boundTaskId = active && active.id !== -1 ? active.id : -1;
    clock.saveConfig();
    if (clock.config.boundTaskId === -1) capsuleToast(UI_TEXT.toastNoBoundTask);
    syncTask();
  }

  $("beginBtn").addEventListener("click", () => { dbg("ctl begin"); bindActiveTaskToClock(); clock.begin(); });
  $("pauseBtn").addEventListener("click", () => { dbg("ctl pause"); if (clock.isPaused()) clock.continue(); else clock.pause(); });
  $("stopBtn").addEventListener("click", () => { dbg("ctl stop"); clock.stop(); });

  /* ————————————————— 跨窗联动（单一源 clockSync.js） ————————————————— */

  installClockStorageSync(clock, {
    onClockResync: () => clock.onStateChange(),
    onTodoListChange: () => syncTask(),
    onSettingsChange: () => {
      applyTheme();
      applyOpacity();
      refreshAnimationVisible();
      clock.onStateChange();
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
    dbg(`gate on=${on} switch=${JSON.stringify(settings.config && settings.config.showDesktopCapsule)}`);
    try {
      if (on) {
        window.__TAURI_INTERNALS__.invoke("plugin:window|show", { label: "capsule" })
          .then(() => { dbg("gate show ok"); restorePos(); })
          .catch((e) => dbg("gate show ERR " + String(e)));
      } else {
        window.__TAURI_INTERNALS__.invoke("plugin:window|hide", { label: "capsule" })
          .catch((e) => dbg("gate hide ERR " + String(e)));
      }
    } catch (e) { dbg("gate invoke throw " + String(e)); }
  }
  if (IS_TAURI) {
    window.addEventListener("storage", (e) => {
      if (e.key === SETTINGS_FULL_KEY) gate();
      else if (e.key) dbg("storage key=" + e.key);
    });
  }

  /** 位置记忆：显示后恢复 + 低频轮询保存（Tauri 走 outer_position 精确坐标） */
  const POS_KEY = "desktopCapsulePos";
  function readPos() { try { return store.getItem(POS_KEY); } catch (_) { return null; } }
  function savePos(x, y) { try { store.setItem(POS_KEY, { x, y }); } catch (_) { /* noop */ } }
  function restorePos() {
    if (!IS_TAURI) return;
    const pos = readPos();
    if (!pos || typeof pos.x !== "number") { dbg("restorePos no saved pos"); return; }
    dbg("restorePos -> " + JSON.stringify(pos));
    // 本 Tauri 版命令实参形状（registry 源码 setter! 宏 + CDP 探针实测）：value 为 externally-tagged Position
    try {
      window.__TAURI_INTERNALS__.invoke("plugin:window|set_position", { label: "capsule", value: { Physical: { x: pos.x, y: pos.y } } })
        .then(() => dbg("restorePos ok"))
        .catch((e) => dbg("restorePos ERR " + String(e)));
    } catch (e) { dbg("restorePos throw " + String(e)); }
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
  clock.onStateChange(); // 完整落定初始画面（翻牌值/设备文案/按钮/进度/动画可见性）
  dbg(`boot tauri=${IS_TAURI} switch=${JSON.stringify(settings.config && settings.config.showDesktopCapsule)} state=${clock.config.currentState} timeLeft=${clock.config.timeLeft}`);
  gate();                // 壳环境按当前开关自判定显隐（开=show+恢复记忆位置；默认关=启动即 hide）
  setInterval(pollPos, 1800);
})();
