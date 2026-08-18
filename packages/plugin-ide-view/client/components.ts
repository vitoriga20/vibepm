/**
 * VibeShell —— dsh 风格极简单容器。
 *
 * 布局（从上到下）：
 *   ┌─ shell header ──────────────────────────────────────────────┐
 *   │  蛇 logo + vibepm           home · settings · auth · feed   │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌─ main（两列）─┬─────────────────────────────────────────────┐
 *   │ shell.nav     │ shell.primary                              │
 *   │ （3 张大卡）  │ （当前 route 的面板）                       │
 *   │               │                                             │
 *   ├───────────────┴─────────────────────────────────────────────┤
 *   │ shell.secondary（可空）                                     │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ shell.footer（版本号 / 状态）                               │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * 路由 = hash（#settings / #auth / #feed / # 首页）。
 * 渲染规则：
 *   - shell.nav：永远渲染，大卡点击时按 `item.payload.targetHash` 跳转
 *   - shell.primary：按 hash 选 item.payload.route === 当前 route 的面板；没有则显示「空」提示
 *   - shell.secondary / shell.footer：永远渲染
 */
import { iconEl, iconSVG } from "./icons.js";
import { modules, type RenderRegistry } from "./module-system.js";

const CSS = `
:host{display:block;width:100%;height:100%;}
*, *::before, *::after{box-sizing:border-box}
:host *{color:inherit}
.host{width:100%;height:100%;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);
  font:12.5px/1.55 var(--sans);}

/* ======= 顶部：品牌条（纸白） ======= */
.hd{flex-shrink:0;display:flex;align-items:stretch;justify-content:space-between;
  height:52px;border-bottom:1px solid var(--skin-header-shadow,#dddbd2);background:var(--skin-header,#f7f6f2);
  position:relative;z-index:10}
.hd .brand{display:flex;align-items:center;gap:12px;padding:0 20px;min-width:240px;
  background:
    linear-gradient(90deg, var(--skin-brand-bg1,rgba(255,255,255,.6)), var(--skin-brand-bg2,rgba(247,246,242,.8))),
    var(--skin-brand-base,#f7f6f2);color:var(--skin-brand-ink,var(--ink));border-right:1px solid var(--skin-brand-border,#dcdad1)}
.hd .brand i{color:var(--skin-brand-ink,var(--ink));width:24px;height:24px;display:inline-block;filter:contrast(1)}
.hd .brand b{letter-spacing:2px;font-weight:800;font-family:var(--display-cjk);font-size:15px}
.hd .brand small{color:var(--skin-brand-sub,#7b8087);letter-spacing:1px;margin-left:6px;font:600 9px/1 var(--display-wide);text-transform:uppercase}
.hd .brand .brand-logo{width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;
  border:1px solid var(--skin-brand-border,#dcdad1);box-shadow:0 1px 2px rgba(31,34,40,.08)}
.hd nav{display:flex;align-items:center;gap:4px;padding:0 16px}
.hd nav a{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 14px;
  color:var(--skin-navlink,#5a5f66);text-decoration:none;font:600 11px/1 var(--display-cjk);
  letter-spacing:.04em;cursor:pointer;border:1px solid transparent;border-radius:var(--radius)}
.hd nav a i{width:15px;height:15px;display:inline-block}
.hd nav a:hover{color:var(--ink);border-color:var(--skin-navbar-hover-bd,#cfccc2);background:var(--skin-navbar-hover-bg,#eceae3)}
.hd nav a.active{color:var(--accent);background:var(--accent-dim,#e3efee);border-color:var(--accent-line,#0f6a66);font-weight:700}

/* ======= 主区：左侧满高折叠把手 + 左导航(纸面) + 可缩放分隔条 + 右内容 ======= */
.main{flex:1;min-height:0;display:grid;
  grid-template-columns: [toggle] 12px [nav] var(--nav-w, 300px) [resizer] 8px [primary] 1fr;
  grid-template-rows: 1fr auto;background:var(--bg);position:relative}
.main.collapsed{grid-template-columns: [toggle] 12px [nav] 0 [resizer] 0 [primary] 1fr}
.main.collapsed .nav,.main.collapsed .resizer{display:none;visibility:hidden;overflow:hidden}
.main.collapsed .secondary{display:none}

/* ---- 左侧满高折叠把手（朴素窄条） ---- */
.toggle-bar{grid-column: toggle / span 1;grid-row: 1 / 3;position:relative;
  background:var(--skin-toggle-bg1,#e4e3dc);border-right:1px solid var(--skin-toggle-border,#c9c7bd);
  cursor:pointer;user-select:none;overflow:hidden}
.toggle-bar::before{content:"";position:absolute;left:0;right:0;top:0;bottom:0;pointer-events:none;z-index:0;
  background:linear-gradient(180deg, transparent, var(--skin-toggle-accent,rgba(20,125,120,.06)) 50%, transparent)}
/* 上下简单刻度装饰（克制） */
.toggle-bar .tb-mark{position:absolute;left:0;right:0;text-align:center;color:var(--skin-toggle-mark,#9a9ea5);font:600 7px/1 var(--mono);
  letter-spacing:.03em;pointer-events:none;z-index:1}
.toggle-bar .tb-mark.top{top:18px;display:flex;flex-direction:column;gap:9px;align-items:center}
.toggle-bar .tb-mark.bot{bottom:18px;display:flex;flex-direction:column;gap:9px;align-items:center}
.toggle-bar .tb-mark i{font-style:normal;display:block;opacity:.7}
.toggle-bar .tb-mark i.y{color:var(--accent);opacity:1}
/* 中间 grip：轻微右突，包裹 »« */
.tb-grip{position:absolute;top:50%;left:0;right:0;transform:translateY(-50%) translateX(2px);z-index:3;
  height:70px;display:grid;place-items:center;cursor:pointer}
.tb-grip::before{content:"";position:absolute;inset:4px -2px 4px 0;background:
    linear-gradient(180deg, var(--skin-grip-bg1,#fff), var(--skin-grip-bg2,#f1f0ea) 50%, var(--skin-grip-bg1,#fff));
  border:1px solid var(--skin-grip-border,#c9c7bd);border-radius:var(--radius);
  box-shadow:0 1px 3px rgba(31,34,40,.12);transition:all .15s}
.tb-grip:hover::before{background:linear-gradient(180deg,var(--skin-grip-h1,#fff),var(--skin-grip-h2,#eceae3) 50%,var(--skin-grip-h1,#fff));border-color:var(--accent)}
.tb-grip .tb-arrow{position:relative;z-index:2;color:var(--accent,#147d78);font:700 13px/1 var(--display-wide);
  writing-mode:vertical-rl;text-orientation:upright;letter-spacing:0}

/* ---- 导航区：暖白纸面 ---- */
.nav{overflow:auto;padding:22px 18px 24px;grid-row:1 / 2;grid-column:nav / span 1;position:relative;
  background:var(--skin-nav-base,#efeee9);color:var(--skin-nav-ink,var(--ink));
  border-right:1px solid var(--skin-nav-border,rgba(120,125,120,.4));
  box-shadow:inset 1px 0 0 var(--skin-nav-hi, rgba(255,255,255,.7)), 1px 0 0 var(--skin-nav-shadow,#e3e1d9)}

.resizer{grid-row:1 / 3;grid-column:resizer / span 1;position:relative;cursor:col-resize;touch-action:none;
  background:var(--bg);border-left:1px solid var(--line)}
.resizer::after{content:"";position:absolute;inset:0 auto;width:2px;top:0;bottom:0;left:50%;transform:translateX(-50%);
  background:transparent;transition:background .1s}
.resizer:hover::after,.resizer.active::after{background:var(--accent,#147d78)}
.resizer .grip{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4px;height:30px;
  display:flex;flex-direction:column;gap:3px;align-items:center;justify-content:center;pointer-events:none}
.resizer .grip::before,.resizer .grip::after{content:"";width:2px;height:3px;background:var(--line-strong)}
.resizer{--grip-color:#9aa0a5}
.primary{background:var(--bg);overflow:auto;padding:30px 34px 48px;grid-row:1 / 3;grid-column:primary / span 1;position:relative}
.primary::before{content:"";position:absolute;left:0;right:0;top:0;height:70%;pointer-events:none;z-index:0;
  background:
    linear-gradient(var(--skin-primary-grid,rgba(120,125,130,.03)) 1px, transparent 1px),
    linear-gradient(90deg, var(--skin-primary-grid,rgba(120,125,130,.03)) 1px, transparent 1px);
  background-size:auto, 42px 42px, 42px 42px;
  -webkit-mask-image:radial-gradient(ellipse at center top, #000 30%, transparent 78%);
  mask-image:radial-gradient(ellipse at center top, #000 30%, transparent 78%)}
.primary > canvas.ambient-bg{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;pointer-events:none!important;z-index:0!important}
.primary > :not(canvas.ambient-bg){position:relative;z-index:1}
.secondary{background:var(--bg);grid-row:2 / 3;grid-column:nav / span 1;padding:12px 18px;
  border-top:1px solid var(--line);color:var(--dim);font-size:11px;letter-spacing:.2px}
.secondary code{color:var(--muted)}

/* ======= 导航大卡：纸白 + 细边框 ======= */
.nav-item{display:block;width:100%;margin-bottom:12px;text-align:left;clip-path:none}
.card-nav{display:flex;flex-direction:column;gap:12px;padding:18px 18px 16px;position:relative;overflow:hidden;
  background:linear-gradient(135deg, var(--skin-card-bg1,#fff) 0 78%, var(--skin-card-bg2,#efeee9) 78%);
  color:var(--skin-card-ink,var(--ink));
  border:1px solid var(--skin-card-border,#e4e2da);border-left:3px solid var(--accent);
  border-radius:var(--radius);box-shadow:var(--shadow-panel);
  transition:transform .15s ease,box-shadow .15s ease,background .15s ease}
.card-nav:hover{background:var(--skin-card-bg1,#fff);transform:translateY(-1px);box-shadow:0 3px 10px rgba(31,34,40,.1)}
.card-nav .top{display:flex;align-items:center;gap:14px}
.card-nav .ic{width:40px;height:40px;color:var(--skin-card-ink,var(--ink));flex-shrink:0;position:relative;
  display:grid;place-items:center;background:var(--skin-card-ic-bg,rgba(0,0,0,.04));
  border:1px solid var(--skin-card-ic-bd,rgba(0,0,0,.1));border-radius:var(--radius)}
.card-nav .ic i{width:22px;height:22px;display:block}
.card-nav h3{font-size:14px;color:var(--skin-card-ink,var(--ink));letter-spacing:.3px;margin:0;font-weight:700;font-family:var(--display-cjk)}
.card-nav p{margin:0;color:var(--skin-card-sub,#6b6f76);font-size:12px;line-height:1.6}
.card-nav .cta{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin-top:4px;
  color:var(--skin-card-cta,#147d78);font:700 10px/1 var(--display-wide);letter-spacing:.08em;text-transform:uppercase}
.card-nav .cta::after{content:"›";font-size:18px;line-height:.8}

/* Panels（shell.primary 里的面板） */
.panel > .hd2{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;
  border-bottom:1px solid var(--line)}
.panel > .hd2 h2{font-size:22px;margin:0;letter-spacing:.3px;font-weight:800;font-family:var(--display-cjk);line-height:.9;color:var(--ink)}
.panel > .hd2 small{color:var(--dim);font-size:10px;letter-spacing:.06em;font-family:var(--mono);text-transform:uppercase}

/* Secondary / status pill（小圆角徽章） */
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--line-strong);
  border-radius:var(--radius);font:600 9px/1 var(--mono);letter-spacing:.04em;background:var(--panel);color:var(--muted);
  margin-right:6px;margin-bottom:4px}
.pill.ok{color:var(--ink-ok);border-color:#9cbca8;background:rgba(77,122,94,.1)}
.pill.warn{color:var(--warn);border-color:#c9a86b;background:rgba(161,98,7,.08)}
.pill.err{color:var(--danger);border-color:#cfa39b;background:rgba(179,64,46,.08)}

/* Footer：浅状态条 */
.ft{height:30px;flex-shrink:0;border-top:1px solid var(--line);
  background:var(--panel-alt);display:flex;align-items:center;justify-content:space-between;
  padding:0 20px;color:var(--dim);font:600 9px/1 var(--display-wide);letter-spacing:.1em}
.ft .items{display:flex;gap:16px}
.ft .items span{position:relative}
.ft .items span+span::before{content:"·";margin-right:16px;color:var(--line-strong)}

/* Empty state */
.empty{padding:60px 22px;text-align:center;color:var(--dim);font-size:12px;letter-spacing:.6px}
.empty b{display:block;color:var(--ink);font-size:14px;margin-bottom:8px;letter-spacing:.6px}

/* Onboarding nav grid（外包壳只铺 grid，卡片自身 shadow 内联样式） */
.nav-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:0 0 10px 0}
.nav-grid > *{position:relative}
@media (max-width: 860px){ .nav-grid{grid-template-columns:1fr} }
.nav-empty{color:var(--muted);font-size:12px;letter-spacing:.6px;border:1px dashed var(--line-strong);
  background:rgba(241,240,234,.5);padding:18px;border-radius:var(--radius)}

/* Primary 首页 fallback */
.primary-empty{margin-bottom:16px}
.primary-empty .title{font-size:34px;letter-spacing:-.02em;font-weight:800;color:var(--ink);margin:0 0 10px 0;
  font-family:var(--display-cjk);line-height:.9;display:flex;align-items:center;gap:16px}
.primary-empty .welcome-logo{width:48px;height:48px;object-fit:cover;flex-shrink:0;
  border:1px solid var(--skin-nav-border,rgba(120,125,120,.4));border-radius:var(--radius);
  box-shadow:0 1px 3px rgba(31,34,40,.1)}
.primary-empty .sub{color:var(--muted);font-size:12px;line-height:1.7;margin:0 0 20px 0;max-width:640px}
.ascii-banner{margin:0 0 20px 0;color:var(--accent);font:12px/1.6 var(--mono);white-space:pre;letter-spacing:.04em;
  background:var(--panel);padding:9px 14px;border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:var(--radius);width:fit-content}
.primary-card{display:block;max-width:960px}
.primary-card .primary-head{margin-bottom:18px;padding:6px 0 18px 20px;border-left:3px solid var(--accent);
  border-bottom:1px solid var(--line-strong);position:relative}
.primary-card .primary-head .title{font-size:30px;letter-spacing:-.02em;color:var(--ink);font-weight:800;margin:0;
  font-family:var(--display-cjk);line-height:1}
.primary-card .primary-head .sub{color:var(--muted);font:500 10px/1.4 var(--latin);margin-top:12px;letter-spacing:.06em;text-transform:uppercase}
.sec-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.sec-item{padding:9px 10px;border:1px solid var(--line);border-left:3px solid var(--line-strong);
  background:var(--panel);color:var(--ink);border-radius:var(--radius);box-shadow:var(--shadow-panel);
  font-size:11px;letter-spacing:.3px;font-family:var(--display-cjk)}

/* ======= 折叠动画：朴素淡入淡出（去机械/扫描特效） ======= */
`;

type Slots = Record<string, SlotItem[]>;
interface SlotItem {
  id: string; label?: string; order?: number; icon?: string;
  payload?: Record<string, any>;
}

function asciiBanner(): string {
  const w = window as any;
  const boot = w.__VIBEPM_BOOT__ ?? { rev: "0", entries: [] };
  const entries: Array<{ id?: string }> = Array.isArray(boot.entries) ? boot.entries : [];
  // 壳是直接加载的入口（不在 bootGraph 动态 import 之列），其余都是 client 插件
  const plugins = Math.max(0, entries.length - 1);
  const rev = String(boot.rev ?? "");
  const ver = rev.length > 8 ? rev.slice(0, 8) : (rev || "dev");
  const lines = [
    "┌─────────────────────────────────────┐",
    `│  VIBEPM // PROJECT CONSOLE   ${ver.padEnd(4, " ")} │`,
    `│  CORE ONLINE · PLUGINS ${String(plugins).padEnd(2, " ")} · OK     │`,
    "└─────────────────────────────────────┘",
  ];
  return lines.join("\n");
}

function getSlots(): Slots {
  const w = window as any;
  const raw = w.__VIBEPM_SLOTS__ ?? {};
  const out: Slots = {};
  for (const k of Object.keys(raw)) out[k] = Array.isArray(raw[k]) ? raw[k] : [];
  return out;
}

/** 查渲染注册表：kind → custom element 标签名（面板/导航卡由各插件在 apply 里自注册） */
function renderTag(kind: string): string | undefined {
  try { return modules.services.get<RenderRegistry>("render").get(kind); } catch { return undefined; }
}

function sorted(list: SlotItem[]): SlotItem[] {
  const arr = [...list];
  arr.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  return arr;
}

function parseHash(h: string): { route: string; params: URLSearchParams } {
  const clean = h.replace(/^#\/?/, "");
  const [route = "", raw = ""] = clean.split("?");
  return { route, params: new URLSearchParams(raw) };
}

export class VibeShell extends HTMLElement {
  private _unhash = (): void => {};
  private _root: ShadowRoot | null = null;
  private _currentRoute = "";
  private collapsed = false;

  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    this._root = this.shadowRoot!;
    this.collapsed = localStorage.getItem("vibepm.nav.collapsed") === "1";
    const st = document.createElement("style");
    st.textContent = CSS;
    const host = document.createElement("div");
    host.className = "host";
    this._root.append(st, host);
    this.render();
    const onHash = (): void => this.render();
    window.addEventListener("hashchange", onHash);
    this._unhash = () => window.removeEventListener("hashchange", onHash);
  }

  disconnectedCallback(): void {
    this._unhash();
  }

  private toggleCollapse(_slots: Slots, _route: string): void {
    // ---- 朴素折叠：仅切换状态 + 更新箭头（无机械/扫描/解锁特效） ----
    const host = this._root!.querySelector<HTMLDivElement>(".host")!;
    const main = host.querySelector<HTMLDivElement>(".main")!;
    const tbar = main.querySelector<HTMLDivElement>(".toggle-bar")!;
    const nextState = !this.collapsed;

    const grip = tbar.querySelector<HTMLDivElement>(".tb-grip");
    this.collapsed = nextState;
    localStorage.setItem("vibepm.nav.collapsed", this.collapsed ? "1" : "0");
    main.classList.toggle("collapsed", this.collapsed);
    main.style.setProperty("--nav-w", this.collapsed ? "0px" : null);
    const arrow = grip?.querySelector<HTMLElement>(".tb-arrow");
    if (arrow) arrow.textContent = this.collapsed ? "»" : "«";
  }

  private render(): void {
    const host = this._root!.querySelector<HTMLDivElement>(".host")!;
    const slots = getSlots();
    const hash = parseHash(location.hash);
    const route = hash.route || "";
    this._currentRoute = route;

    host.innerHTML = "";
    host.append(this.mkHeader(slots, route), this.mkMain(slots, route), this.mkFooter(slots));
  }

  private mkHeader(slots: Slots, route: string): HTMLElement {
    const hd = document.createElement("div");
    hd.className = "hd";
    const brand = document.createElement("div");
    brand.className = "brand";
    const logo = document.createElement("img");
    logo.className = "brand-logo";
    logo.src = "/static/img/logo-snake.jpg";
    logo.alt = "vibepm";
    brand.appendChild(logo);
    const b = document.createElement("b");
    b.textContent = "vibepm";
    brand.appendChild(b);
    const small = document.createElement("small");
    small.textContent = "· minimal";
    brand.appendChild(small);
    const nav = document.createElement("nav");
    // 导航项由 shell.primary 面板槽驱动（被禁用插件 → 面板消失 → 导航同步消失）；
    // 图标取面板 payload.icon（数据驱动，壳不硬编码 route→icon）
    const mkLink = (r: string, label: string, iconName: string | null) => {
      const a = document.createElement("a");
      a.href = r ? `#${r}` : "#/";
      const isActive = r === route || (!r && !route);
      if (isActive) a.classList.add("active");
      if (iconName) a.appendChild(iconEl(iconName as any, 14));
      const span = document.createElement("span");
      span.textContent = label;
      a.appendChild(span);
      nav.appendChild(a);
    };
    mkLink("", "Home", null);
    const panelItems = (slots["shell.primary"] ?? []).slice().sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    for (const it of panelItems) {
      const pd: any = it.payload ?? {};
      const r = String(pd.route ?? "");
      if (!r) continue;
      // 内部路由面板（如登录页/详情页，payload.nav === false）渲染但不产生顶栏 tab
      if (pd.nav === false) continue;
      mkLink(r, String(pd.title ?? it.label ?? r), pd.icon ?? null);
    }
    hd.append(brand, nav);
    return hd;
  }

  private mkMain(slots: Slots, route: string): HTMLElement {
    const main = document.createElement("div");
    main.className = this.collapsed ? "main collapsed" : "main";
    if (this.collapsed) main.style.setProperty("--nav-w", "0px");

    // --- 左侧满高折叠把手 toggle-bar ---
    const tbar = document.createElement("div");
    tbar.className = "toggle-bar";
    tbar.title = this.collapsed ? "展开侧边栏 (ASCII · Rhine Latch)" : "折叠侧边栏 (ASCII · Rhine Latch)";
    // 顶部 ASCII 装饰
    const markTop = document.createElement("div");
    markTop.className = "tb-mark top";
    markTop.innerHTML = `<i>·</i><i class="y">●</i><i>│</i><i>0</i><i>1</i><i>┤</i><i>·</i>`;
    // 底部 ASCII 装饰
    const markBot = document.createElement("div");
    markBot.className = "tb-mark bot";
    markBot.innerHTML = `<i>·</i><i>├</i><i>│</i><i>F</i><i>3</i><i class="y">●</i><i>·</i>`;
    // 中间 grip（»« 微突起）
    const grip = document.createElement("div");
    grip.className = "tb-grip";
    const arrow = document.createElement("span");
    arrow.className = "tb-arrow";
    arrow.textContent = this.collapsed ? "»" : "«";
    grip.appendChild(arrow);
    grip.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleCollapse(slots, route);
    });
    // 整条 bar 都能点（但 grip 为主）
    tbar.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tb-grip")) return;
      this.toggleCollapse(slots, route);
    });
    tbar.append(markTop, grip, markBot);

    const navSec = document.createElement("section");
    navSec.className = "nav";
    this.renderNav(navSec, slots);
    const primary = document.createElement("section");
    primary.className = "primary";
    this.renderPrimary(primary, slots, route);
    const resizer = document.createElement("div");
    resizer.className = "resizer";
    const gripR = document.createElement("div");
    gripR.className = "grip";
    resizer.appendChild(gripR);
    this.bindResizer(resizer, main);
    const secondary = document.createElement("section");
    secondary.className = "secondary";
    this.renderSecondary(secondary, slots);
    main.append(tbar, navSec, resizer, primary, secondary);
    return main;
  }

  private bindResizer(handle: HTMLElement, main: HTMLElement): void {
    const KEY = "vibepm.navw";
    const MIN = 210, MAX = 560;
    let dragging = false;
    let finalW = 330;
    const init = (): void => {
      const saved = Number.parseInt(localStorage.getItem(KEY) ?? "330", 10);
      finalW = Math.min(MAX, Math.max(MIN, Number.isFinite(saved) ? saved : 330));
      main.style.setProperty("--nav-w", `${finalW}px`);
    };
    init();
    const onMove = (e: MouseEvent): void => {
      if (!dragging) return;
      const r = main.getBoundingClientRect();
      finalW = Math.min(MAX, Math.max(MIN, e.clientX - r.left));
      main.style.setProperty("--nav-w", `${finalW}px`);
    };
    const onUp = (): void => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("active");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(KEY, String(Math.round(finalW)));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      handle.classList.add("active");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  private renderNav(box: HTMLElement, slots: Slots): void {
    const items = (slots["shell.nav"] ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!items.length) {
      box.innerHTML = `<div class="nav-empty">（还没有插件注册 shell.nav）</div>`;
      return;
    }
    const list = document.createElement("div");
    list.className = "nav-grid";
    for (const it of items) {
      const p: any = it.payload ?? {};
      const tag = renderTag(String(p.kind ?? ""));
      if (p.kind === "nav-card" && tag) {
        const el = document.createElement(tag);
        el.setAttribute("icon", String(p.icon ?? "help"));
        el.setAttribute("title", it.label ?? "");
        el.setAttribute("desc", String(p.desc ?? ""));
        el.setAttribute("state", String(p.state ?? "idle"));
        el.setAttribute("href", String(p.hash ?? "#"));
        list.appendChild(el);
      } else {
        const d = document.createElement("div");
        d.className = "sec-item";
        d.textContent = it.label ?? it.id;
        list.appendChild(d);
      }
    }
    box.appendChild(list);
  }

  private renderPrimary(box: HTMLElement, slots: Slots, route: string): void {
    const items = (slots["shell.primary"] ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const p = items.find((x) => String((x.payload as any)?.route ?? "") === route);
    if (!p) {
      const wrap = document.createElement("div");
      wrap.className = "primary-empty";
      wrap.innerHTML = `<pre class="ascii-banner">${asciiBanner()}</pre>
        <div class="title"><img class="welcome-logo" src="/static/img/logo-snake.jpg" alt="">Welcome</div>
        <div class="sub">从上方导航条或左侧卡片进入功能。所有功能均按插件方式装卸。</div>`;
      box.appendChild(wrap);
      const secondary = document.createElement("div");
      secondary.className = "nav-grid";
      const navItems = (slots["shell.nav"] ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const it of navItems) {
        const pp: any = it.payload ?? {};
        const tag = renderTag(String(pp.kind ?? ""));
        if (pp.kind === "nav-card" && tag) {
          const el = document.createElement(tag);
          el.setAttribute("icon", String(pp.icon ?? "help"));
          el.setAttribute("title", it.label ?? "");
          el.setAttribute("desc", String(pp.desc ?? ""));
          el.setAttribute("state", String(pp.state ?? "idle"));
          el.setAttribute("href", String(pp.hash ?? "#"));
          secondary.appendChild(el);
        }
      }
      if (secondary.children.length) box.appendChild(secondary);
      return;
    }
    const kind = String((p.payload as any)?.kind ?? "");
    const title = String((p.payload as any)?.title ?? p.label ?? "");
    const desc = String((p.payload as any)?.desc ?? "");
    const card = document.createElement("div");
    card.className = "primary-card";
    const head = document.createElement("div");
    head.className = "primary-head";
    head.innerHTML = `<div class="title">${title}</div><div class="sub">${desc}</div>`;
    card.appendChild(head);
    // 面板渲染数据驱动：kind → 标签名由面板插件在 apply 里注册，壳不再 switch 硬编码
    const tag = renderTag(kind);
    let body: HTMLElement;
    if (tag) {
      body = document.createElement(tag);
    } else {
      body = document.createElement("div");
      body.className = "empty";
      body.innerHTML = `<b>未识别面板</b> kind=${kind || "—"}；未提供对应 <code>custom element</code>。`;
    }
    card.appendChild(body);
    box.appendChild(card);
  }

  private renderSecondary(box: HTMLElement, slots: Slots): void {
    const items = sorted(slots["shell.secondary"] ?? []);
    if (items.length === 0) {
      box.innerHTML = `<div>Tip · 插件可往 <code style="color:var(--fg)">shell.secondary</code> 注册状态 pill。</div>`;
      return;
    }
    for (const it of items) {
      const pill = document.createElement("span");
      pill.className = "pill";
      const tone = typeof it.payload?.tone === "string" ? it.payload.tone : "";
      if (tone === "ok" || tone === "warn" || tone === "err") pill.classList.add(tone);
      if (it.icon) pill.appendChild(iconEl(it.icon as any, 12));
      const span = document.createElement("span");
      span.textContent = it.label ?? it.id;
      pill.appendChild(span);
      box.appendChild(pill);
    }
  }

  private mkFooter(slots: Slots): HTMLElement {
    const ft = document.createElement("div");
    ft.className = "ft";
    const left = document.createElement("div");
    left.className = "items";
    for (const it of sorted(slots["shell.footer"] ?? [])) {
      const span = document.createElement("span");
      span.textContent = it.label ?? it.id;
      left.appendChild(span);
    }
    const right = document.createElement("div");
    right.textContent = window.location.host;
    ft.append(left, right);
    return ft;
  }
}
