/**
 * growBridge.js 番茄生长动画 · 浮层桥接
 *  - 右下角 growWin 里 iframe 加载 tomato-life.html（同源 /plugins/<id>/preview/）
 *  - 注入样式隐藏动画自带的 HUD/按钮/进度环，保留纯植物叙事
 *  - 桥接画内 window.__TOMATO__：set(p) 投进度 / jump() 转红坠果 / reset() 回种子
 *  - 提供 growHead 拖拽移动
 *  供 floatingWindow.js 驱动（专注开始→投进度；暂停→冻结；结束→jump/reset）
 */
(function () {
  const win = document.getElementById("growWin");
  const head = document.getElementById("growHead");
  const iframe = document.getElementById("tomatoLife");
  let loaded = false;
  let dragging = false, offX = 0, offY = 0;

  /* —— 让动画铺满浮层（画内 HUD/按钮/背景已从源文件删除，无需再隐藏） —— */
  const HIDE_CSS = `html,body{height:100%;margin:0;overflow:hidden;display:block;background:transparent;}
    body{align-items:flex-start;justify-content:flex-start;}
    .wrap{position:relative;width:100%!important;height:100%!important;max-height:none!important;aspect-ratio:auto!important;}`;

  /* —— 拖拽 —— */
  function onDown(e) {
    if (e.target.closest("iframe")) return; // 不进 iframe 交互
    dragging = true;
    const r = win.getBoundingClientRect();
    offX = e.clientX - r.left;
    offY = e.clientY - r.top;
    win.classList.add("dragging");
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    const x = e.clientX - offX;
    const y = e.clientY - offY;
    win.style.left = Math.max(0, x) + "px";
    win.style.top = Math.max(0, y) + "px";
    win.style.right = "auto";
    win.style.bottom = "auto";
  }
  function onUp() { dragging = false; win.classList.remove("dragging"); }

  /* —— 对外桥接口 —— */
  const bridge = {
    /* iframe 就绪后注入隐藏样式 */
    attach() {
      iframe.addEventListener("load", () => {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const style = doc.createElement("style");
        style.textContent = HIDE_CSS;
        doc.head.appendChild(style);
        loaded = true;
        bridge.reset();
      });
    },
    /* 投进度 0~1 */
    apply(p) {
      const t = iframe.contentWindow && iframe.contentWindow.__TOMATO__;
      if (t) t.set(p);
      else if (loaded) console.warn("growBridge: __TOMATO__ 未就绪");
    },
    /* 触发转红 → 坠果 → 终局冻结 */
    rip() {
      const t = iframe.contentWindow && iframe.contentWindow.__TOMATO__;
      if (t) t.jump();
    },
    /* 读取 iframe 当前进度/阶段（供外层判定终局是否已冻结） */
    state() {
      const t = iframe.contentWindow && iframe.contentWindow.__TOMATO__;
      return t ? t.get() : null;
    },
    /* 回种子并解锁冻结（支持下一轮专注） */
    reset() {
      const t = iframe.contentWindow && iframe.contentWindow.__TOMATO__;
      if (t) t.resetAll();
      else bridge.apply(0);
    },
  };

  /* 初始化 */
  head.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  bridge.attach();

  window.growBridge = bridge;
})();