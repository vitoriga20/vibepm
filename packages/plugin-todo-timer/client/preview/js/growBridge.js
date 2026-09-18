/**
 * growBridge.js 番茄生长动画 · iframe 桥接
 *  - 桌面胶囊页（capsule.html）里 iframe 加载 tomato-life.html（同源 /plugins/<id>/preview/）
 *  - 注入样式让动画铺满容器（画内 HUD/按钮/背景已从源文件删除）
 *  - 桥接画内 window.__TOMATO__：set(p) 投进度 / jump() 转红坠果 / reset() 回种子
 *  - 供 capsule.js 驱动（专注投进度；跑满 jump→冻结→reset）；
 *    窗体移动两环境各走系统拖动（壳=start_dragging / popup=OS 标题栏），页内拖拽已随浮层退役删除
 */
(function () {
  const iframe = document.getElementById("tomatoLife");
  let loaded = false;

  /* —— 让动画铺满容器 —— */
  const HIDE_CSS = `html,body{height:100%;margin:0;overflow:hidden;display:block;background:transparent;}
    body{align-items:flex-start;justify-content:flex-start;}
    .wrap{position:relative;width:100%!important;height:100%!important;max-height:none!important;aspect-ratio:auto!important;}`;

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
  bridge.attach();

  window.growBridge = bridge;
})();