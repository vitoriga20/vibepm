/**
 * 皮肤 token 同步：把 vibepm 壳 :root 的皮肤 CSS 变量同步到本页 :root。
 *  - 番茄钟页面跑在 iframe 内，不继承父文档 CSS 变量 → 从 parent（壳页面，其自身已
 *    从壳同步过 token）读取；
 *  - 皮肤插件（如 plugin-skin-rhine）向壳 :root 注入/移除 token，此处监听并实时同步；
 *  - color.css 的变量映射层引用这些 token → 番茄钟样式非硬编码、跟随当前皮肤。
 *  - 独立打开 preview（无 parent）时跳过，回落到 color.css 的 fallback 值。
 */
(function () {
  const PARENT = window.parent;
  if (!PARENT || PARENT === window) return;

  // 皮肤 token 清单：vibepm 壳 shell.css :root 全局 token + skin-* 分区 token + 字体族
  const TOKEN_KEYS = [
    "--bg", "--bg-deep", "--panel", "--panel-dark", "--panel-alt", "--panel-2",
    "--ink", "--fg", "--text", "--muted", "--dim", "--on-ink",
    "--line", "--line-strong",
    "--yellow", "--yellow-2", "--accent", "--accent-dim", "--accent-line",
    "--warn", "--danger", "--ink-ok",
    "--radius", "--radius-s", "--shadow-panel", "--shadow-dark",
    "--skin-header", "--skin-header-shadow",
    "--skin-navlink", "--skin-navbar-hover-bg", "--skin-navbar-hover-bd",
    "--skin-nav-base", "--skin-nav-scrim", "--skin-nav-edge", "--skin-nav-line",
    "--skin-nav-border", "--skin-nav-hi", "--skin-nav-shadow", "--skin-nav-ink", "--skin-nav-texture",
    "--skin-toggle-bg1", "--skin-toggle-bg2", "--skin-toggle-border", "--skin-toggle-accent", "--skin-toggle-mark",
    "--skin-grip-bg1", "--skin-grip-bg2", "--skin-grip-border", "--skin-grip-h1", "--skin-grip-h2",
    "--skin-card-bg1", "--skin-card-bg2", "--skin-card-border", "--skin-card-ink",
    "--skin-card-ic-bg", "--skin-card-ic-bd", "--skin-card-sub", "--skin-card-cta",
    "--skin-primary-grid", "--skin-primary-glow",
    "--display-cjk", "--display-wide", "--sans", "--latin", "--numeric", "--mono",
  ];

  function sync() {
    const root = document.documentElement;
    const cs = PARENT.getComputedStyle(PARENT.document.documentElement);
    for (const k of TOKEN_KEYS) {
      const v = cs.getPropertyValue(k).trim();
      if (v) root.style.setProperty(k, v);
    }
    // 计算强调色对比文字色 --on-accent（accent 亮 → 深字，accent 暗 → 浅字）
    const accent = cs.getPropertyValue("--accent").trim();
    const on = accent ? computeOnAccent(accent) : null;
    if (on) root.style.setProperty("--on-accent", on);
  }

  // 按相对亮度选对比文字色：accent 柠檬黄类亮色 → 深墨；深青类暗色 → 近白
  function computeOnAccent(accent) {
    const m = accent.match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return null;
    const [r, g, b] = m.slice(0, 3).map(Number);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.5 ? "#14161e" : "#f2f0e8";
  }

  sync();
  if (typeof MutationObserver !== "undefined") {
    // 皮肤插件向父 :root 内联写入/移除 token（style 属性变化）时实时同步
    new MutationObserver(sync).observe(PARENT.document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
      subtree: false,
    });
  }
  // 兜底轮询：父 stylesheet 变更（非内联）或观察器失效时也能跟上
  let last = "";
  setInterval(() => {
    const cur = PARENT.document.documentElement.getAttribute("style") || "";
    if (cur !== last) { last = cur; sync(); }
  }, 800);
})();
