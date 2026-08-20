/**
 * plugin-skin-rhine: client 端
 *  - 向 document.documentElement(:root) 覆盖 @VIBE-SKIN token，实现整皮切换为「终末地·暗色金属+柠檬黄」。
 *  - dispose 时 removeProperty 撤回 → 回落 shell.css 默认（科研黄黑）。无需重渲染（CSS 变量天然响应）。
 *  - 顺序：其他 client module 在 ide-view bootstrap 后注入；首帧为默认皮肤，注入完成即自动变化。
 */
// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};

/** 终末地 (Rhine/Endfield) 工业皮肤 token 覆盖。键 = shell.css :root 里的变量（全局 token + @VIBE-SKIN）。 */
const RHINE_TOKEN: Record<string, string> = {
  // ---- 全局 token（覆盖壳/插件的硬底） ----
  "--bg":                   "#111316",
  "--bg-deep":              "#090b0d",
  "--panel-dark":           "#1a1d21",
  "--panel":                "#1b1e29",
  "--panel-alt":            "#14161e",
  "--panel-2":              "#20232e",
  "--ink":                  "#f2f0e8",
  "--fg":                   "#f2f0e8",
  "--text":                 "#eaebe6",
  "--muted":                "#9aa0ab",
  "--dim":                  "#8a8c96",
  "--line":                 "#2c2f3d",
  "--line-strong":          "#3a3e4e",
  "--yellow":               "#ffd84d",
  "--yellow-2":             "#d9b300",
  "--accent":               "#ffd84d",
  "--accent-dim":           "#3a3400",
  "--accent-line":          "#d9b300",
  "--warn":                 "#d9b300",
  "--danger":               "#ff625d",
  "--ink-ok":               "#22a06b",
  "--on-ink":               "#eaebe6",
  "--radius":               "0px",
  "--radius-s":             "0px",
  "--shadow-panel":         "0 1px 0 rgba(255,255,255,.14) inset, 0 14px 28px rgba(0,0,0,.3), 8px 8px 0 rgba(0,0,0,.48), 10px 10px 0 rgba(255,216,77,.22)",
  "--shadow-dark":          "0 1px 0 rgba(255,255,255,.08) inset, 0 18px 42px rgba(0,0,0,.46), 6px 7px 0 #050607, 8px 9px 0 rgba(255,216,77,.28)",
  // 顶栏
  "--skin-header":           "#0a0c10",
  "--skin-header-shadow":    "#030407",
  // 品牌条：暗色金属
  "--skin-brand-bg1":        "rgba(22,24,32,.98)",
  "--skin-brand-bg2":        "rgba(28,31,42,.96)",
  "--skin-brand-base":       "#161820",
  "--skin-brand-ink":        "#f2f0e8",
  "--skin-brand-sub":        "#8a8c96",
  "--skin-brand-border":     "#242630",
  // 顶栏导航项
  "--skin-navlink":          "#9aa0ab",
  "--skin-navbar-hover-bg":  "#1c1f28",
  "--skin-navbar-hover-bd":  "#353845",
  // 侧边栏：暗墨蓝金属 + 柠檬黄描边
  "--skin-nav-base":         "#14161e",
  "--skin-nav-scrim":        "rgba(255,216,77,.05)",
  "--skin-nav-edge":         "rgba(255,216,77,.10)",
  "--skin-nav-line":         "rgba(255,216,77,.16)",
  "--skin-nav-border":       "rgba(255,216,77,.28)",
  "--skin-nav-hi":           "rgba(255,255,255,.04)",
  "--skin-nav-shadow":       "#030407",
  "--skin-nav-ink":          "#ecebe4",
  "--skin-nav-texture":      "rgba(241,236,220,.03)",
  // 侧边栏窄图标栏：图标/悬停/选中 overlay（暗墨蓝 + 柠檬黄左条）
  "--skin-nav-icon":         "#8a8c96",
  "--skin-nav-ic-hover":     "#f2f0e8",
  "--skin-nav-hover-bg":     "rgba(255,255,255,.06)",
  "--skin-nav-ov-bg":        "#1a1d21",
  "--skin-nav-ov-bar":       "#ffd84d",
  "--skin-nav-shadow-x":     "rgba(0,0,0,.5)",
  // 折叠把手
  "--skin-toggle-bg1":       "#1a1c26",
  "--skin-toggle-bg2":       "#12141c",
  "--skin-toggle-border":    "#282a36",
  "--skin-toggle-accent":    "rgba(255,216,77,.08)",
  "--skin-toggle-mark":      "#6a6d78",
  "--skin-grip-bg1":         "#1f2230",
  "--skin-grip-bg2":         "#171a26",
  "--skin-grip-border":      "#3a3e4e",
  "--skin-grip-h1":          "#272b3a",
  "--skin-grip-h2":          "#1c1f2c",
  // 导航卡片：暗金属卡 + 柠檬黄
  "--skin-card-bg1":         "#1b1e29",
  "--skin-card-bg2":         "#13161f",
  "--skin-card-border":      "#2c2f3d",
  "--skin-card-ink":         "#f0efe8",
  "--skin-card-ic-bg":       "rgba(0,0,0,.24)",
  "--skin-card-ic-bd":       "rgba(255,255,255,.08)",
  "--skin-card-sub":         "#9a9daa",
  "--skin-card-cta":         "#f6f6ef",
  // 主区：更重的黄光 + 更亮网格线
  "--skin-primary-grid":     "rgba(255,255,255,.05)",
  "--skin-primary-glow":     "rgba(255,216,77,.09)",
};

const SELF_ID = "plugin-skin-rhine";

/**
 * 工业结构增强 CSS：默认壳为「学术朴素」（直角/轻阴影）。终末地皮肤开启时，
 * 向 vibe-shell 的 shadowRoot 注入这段结构样式，把卡片/面板/把手/网格升级为
 * 莱因机械工业语言（割角/硬位移阴影/角框/圆点网格/柠檬黄辉光）。
 * 参考：终末地 official department.css（面板+角框+圆点网格+辉光）+ headquarters.css（机甲按钮）。
 * dispose 时移除，回落默认壳朴素结构。
 */
const INDUSTRIAL_CSS = `
/* ================= 莱因机械工业结构增强 =================
   结构语言 + 引用皮肤 token（var(--accent)/var(--panel)/var(--skin-*)…）——不散值，
   改皮肤只需改 RHINE_TOKEN，此处自动跟随。 */

/* ---- 顶栏：底部强调色机械线 ---- */
.hd{position:relative}
.hd::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;
  background:linear-gradient(90deg, var(--accent) 0 12%, color-mix(in srgb, var(--accent) 15%, transparent) 30%, transparent 70%);pointer-events:none}

/* ---- 卡片：割角 + 硬位移阴影 + 左强调条 + 四角 corner ---- */
.card-nav{
  clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%);
  border-left:4px solid var(--accent);
  border-radius:0;
  box-shadow:
    6px 6px 0 var(--bg-deep),
    8px 8px 0 color-mix(in srgb, var(--accent) 12%, transparent),
    0 14px 28px rgba(0,0,0,.30)!important;
  background:linear-gradient(135deg, var(--skin-card-bg1) 0 78%, var(--skin-card-bg2) 78%);
}
.card-nav::after{content:"";position:absolute;right:-28px;bottom:-28px;width:110px;height:110px;
  border:1px solid color-mix(in srgb, var(--accent) 10%, transparent);transform:rotate(45deg);pointer-events:none}
.card-nav:hover{transform:translateY(-2px);
  box-shadow:5px 6px 0 var(--bg-deep),7px 8px 0 color-mix(in srgb, var(--accent) 22%, transparent)!important}
/* 四角 corner 框 */
.card-nav .top{position:relative}
.card-nav .top::before,.card-nav .top::after{content:"";position:absolute;width:14px;height:14px;
  border-color:color-mix(in srgb, var(--accent) 55%, transparent);border-style:solid;pointer-events:none}
.card-nav .top::before{top:-1px;left:-14px;border-width:2px 0 0 2px}
.card-nav .top::after{bottom:-2px;right:-14px;border-width:0 2px 2px 0}
.card-nav .ic{border-radius:0;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%);
  border:1px solid color-mix(in srgb, var(--accent) 28%, transparent);background:rgba(0,0,0,.28)}
.card-nav .cta{color:var(--accent)}
.card-nav .cta::after{content:"\u203A";font-size:18px;line-height:.8}
.card-nav h3{color:var(--skin-card-ink)}.card-nav p{color:var(--skin-card-sub)}

/* ---- 状态徽章：辉光（对齐终末地状态区） ---- */
.pill{background:var(--skin-toggle-bg2)!important;border-color:var(--line-strong);color:var(--muted)!important}
.pill.ok{color:var(--ink-ok)!important;border-color:var(--ink-ok)!important;background:color-mix(in srgb, var(--ink-ok) 14%, transparent)!important;text-shadow:0 0 10px color-mix(in srgb, var(--ink-ok) 55%, transparent)}
.pill.warn{color:var(--accent)!important;border-color:color-mix(in srgb, var(--accent) 45%, transparent)!important;background:color-mix(in srgb, var(--accent) 12%, transparent)!important;text-shadow:0 0 10px color-mix(in srgb, var(--accent) 45%, transparent)}

/* ---- 面板 / primary-head：内缩角框 ---- */
.primary-head{border-left:3px solid var(--accent);border-bottom:1px solid var(--line-strong);position:relative}
.primary-head::before{content:"";position:absolute;left:-1px;bottom:-1px;width:190px;height:4px;background:var(--accent)}
.primary-head::after{content:"";position:absolute;inset:10px;border:1px solid color-mix(in srgb, var(--accent) 12%, transparent);pointer-events:none}
.primary-head .title{color:var(--on-ink)}
.panel > .hd2{border-bottom:1px solid var(--line-strong)}
.panel > .hd2 h2{color:var(--on-ink)}

/* ---- primary 网格：强调色 + 圆点 ---- */
.primary::before{background:
  radial-gradient(circle, color-mix(in srgb, var(--accent) 12%, transparent) 1px, transparent 1px),
  linear-gradient(90deg, color-mix(in srgb, var(--accent) 5%, transparent) 1px, transparent 1px),
  linear-gradient(color-mix(in srgb, var(--accent) 5%, transparent) 1px, transparent 1px)!important;
  background-size:9px 9px, 42px 42px, 42px 42px!important}

/* ---- 折叠把手：强调色 grip + 刻度 ---- */
.tb-grip::before{clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%);
  border-left:2px solid var(--accent);box-shadow:3px 3px 0 rgba(0,0,0,.6)!important;border-radius:0}
.tb-grip .tb-arrow{color:var(--accent)}
.toggle-bar .tb-mark{color:var(--skin-toggle-mark)}
.toggle-bar .tb-mark i.y{color:var(--accent);text-shadow:0 0 6px color-mix(in srgb, var(--accent) 55%, transparent)}
.toggle-bar::before{background:
  repeating-linear-gradient(180deg, transparent 0 11px, color-mix(in srgb, var(--accent) 10%, transparent) 11px 12px)}
.toggle-bar{background:repeating-linear-gradient(180deg, var(--skin-toggle-bg1) 0 2px, var(--skin-toggle-bg2) 2px 4px)!important}

/* ---- 导航区：暗墨蓝窄图标栏 + 斜纹 + 微粒（Endfield 结构；左条/阴影走 skin token） ---- */
.nav{background:var(--skin-nav-base)!important;
  border-right:1px solid var(--skin-nav-border)!important;
  box-shadow:inset 1px 0 0 var(--skin-nav-hi)}
.nav::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
  background:
    repeating-linear-gradient(135deg, var(--skin-nav-texture) 0 1px, transparent 1px 9px),
    radial-gradient(circle, color-mix(in srgb, var(--accent) 5%, transparent) 1px, transparent 1px);
  background-size:auto, 9px 9px}

/* ---- 按钮：机甲斜切 + 位移 + 发光 ---- */
button.primary{clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%);
  border-radius:0;background:linear-gradient(90deg, color-mix(in srgb, var(--accent) 96%, transparent), color-mix(in srgb, var(--accent) 96%, white 4%));
  color:var(--bg-deep);box-shadow:4px 4px 0 var(--bg-deep),6px 6px 0 color-mix(in srgb, var(--accent) 34%, transparent)}
button.primary:hover{transform:translate(-1px,-1px);
  box-shadow:5px 5px 0 var(--bg-deep),7px 7px 0 color-mix(in srgb, var(--accent) 40%, transparent),0 0 22px color-mix(in srgb, var(--accent) 28%, transparent)}
`;

/** 往 vibe-shell shadowRoot 注入/移除结构增强样式 */
function injectShadowCss(root: Element, css: string, token: string): HTMLElement {
  let el = root.shadowRoot?.getElementById(token);
  if (!el && root.shadowRoot) {
    el = document.createElement("style");
    el.id = token;
    el.textContent = css;
    root.shadowRoot.append(el);
  }
  return el as HTMLElement;
}

modules.register(SELF_ID, () => ({
  name: SELF_ID,
  inject: [],
  provide: [],
  apply() {
    const root = document.documentElement;
    // 逐 key 写入 :root，皮肤即生效；记下原本是否已定义，dispose 可精确还原。
    const prior: Array<{ key: string; had: boolean }> = [];
    for (const [k, v] of Object.entries(RHINE_TOKEN)) {
      prior.push({ key: k, had: root.style.getPropertyValue(k) !== "" });
      root.style.setProperty(k, v);
    }

    // 等待壳渲染，注入工业结构增强样式（shadowRoot 内）
    const TOKEN = "vibepm-skin-rhine-ind";
    const inject = (): void => {
      const shell = document.querySelector("vibe-shell");
      if (shell?.shadowRoot) injectShadowCss(shell, INDUSTRIAL_CSS, TOKEN);
    };
    inject();
    let obs: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      obs = new MutationObserver(inject);
      obs.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      for (const { key, had } of prior) {
        if (had) root.style.removeProperty(key);
      }
      obs?.disconnect();
      const sh = document.querySelector("vibe-shell")?.shadowRoot;
      sh?.getElementById(TOKEN)?.remove();
    };
  },
}));