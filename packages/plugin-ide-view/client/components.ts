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

const CSS = `
:host{display:block;width:100%;height:100%;}
*, *::before, *::after{box-sizing:border-box}
:host *{color:inherit}
.host{width:100%;height:100%;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);
  font:13px/1.55 var(--mono);}

/* Header */
.hd{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 20px;
  border-bottom:1px solid var(--line-strong);background:var(--panel);flex-shrink:0}
.hd .brand{display:flex;align-items:center;gap:10px;color:var(--fg)}
.hd .brand i{color:var(--accent);width:22px;height:22px;display:inline-block}
.hd .brand b{letter-spacing:2px;font-weight:600}
.hd .brand small{color:var(--dim);letter-spacing:1px;margin-left:6px}
.hd nav{display:flex;align-items:center;gap:2px}
.hd nav a{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--radius);
  color:var(--dim);text-decoration:none;font-size:12px;cursor:pointer;border:1px solid transparent}
.hd nav a i{width:14px;height:14px;display:inline-block}
.hd nav a:hover{color:var(--fg);background:var(--panel-alt)}
.hd nav a.active{color:var(--accent);border-color:var(--accent-line);background:var(--accent-dim)}

/* Main grid */
.main{flex:1;min-height:0;display:grid;grid-template-columns: 360px 1fr;grid-template-rows: 1fr auto;gap:1px;background:var(--line-strong);}
.nav{background:var(--bg);overflow:auto;padding:28px 22px;grid-row: 1 / 2;grid-column: 1 / 2;}
.primary{background:var(--bg);overflow:auto;padding:28px 32px;grid-row:1 / 3;grid-column: 2 / 3;}
.secondary{background:var(--bg);grid-row: 2 / 3;grid-column: 1 / 2;padding:14px 22px;
  border-top:1px solid var(--line-strong);color:var(--dim);font-size:12px}

/* Cards（shell.nav 大卡） */
.card{display:flex;flex-direction:column;gap:12px;padding:22px;border-radius:var(--radius);
  background:var(--panel);border:1px solid var(--line);cursor:pointer;margin-bottom:14px;transition:border-color .15s,transform .15s}
.card:hover{border-color:var(--accent-line);transform:translateY(-1px)}
.card .top{display:flex;align-items:center;gap:14px}
.card .ic{width:40px;height:40px;color:var(--accent);flex-shrink:0;
  display:flex;align-items:center;justify-content:center;border-radius:var(--radius);
  background:var(--accent-dim);border:1px solid var(--accent-line)}
.card .ic i{width:22px;height:22px;display:block}
.card h3{font-size:14px;color:var(--fg);letter-spacing:.5px;margin:0;font-weight:600}
.card p{margin:0;color:var(--dim);font-size:12px;line-height:1.55}
.card .cta{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;
  margin-top:4px;color:var(--accent);font-size:12px;letter-spacing:.5px}

/* Panels（shell.primary 里的面板） */
.panel > .hd2{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.panel > .hd2 h2{font-size:16px;margin:0;letter-spacing:1px;font-weight:600}
.panel > .hd2 small{color:var(--dim);font-size:11px;letter-spacing:.5px}

/* Secondary 条目 */
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--line);
  border-radius:999px;font-size:11px;background:var(--panel);margin-right:6px;margin-bottom:4px}
.pill.ok{color:#2f8566;border-color:#2f8566;background:#16392e}
.pill.warn{color:var(--warn);border-color:var(--warn);background:#30271a}
.pill.err{color:var(--danger);border-color:var(--danger);background:#3a1f1f}

/* Footer */
.ft{height:28px;flex-shrink:0;border-top:1px solid var(--line-strong);
  background:var(--panel-alt);display:flex;align-items:center;justify-content:space-between;
  padding:0 20px;color:var(--dim);font-size:11px;letter-spacing:1px}
.ft .items{display:flex;gap:14px}

/* Empty state */
.empty{padding:60px 22px;text-align:center;color:var(--dim);font-size:12px;letter-spacing:1px}
.empty b{display:block;color:var(--fg);font-size:14px;margin-bottom:8px;letter-spacing:1px}

/* Onboarding: shell.nav 2x2 grid 样式（外层 nav + nav-grid + nav-card 已经带 shadow DOM 内部样式；壳只负责 grid） */
.nav-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:0 0 10px 0}
@media (max-width: 860px){ .nav-grid{grid-template-columns:1fr} }
.nav-empty{color:var(--dim);font-size:12px;padding:14px 2px;letter-spacing:1px;border:1px dashed var(--line);border-radius:var(--radius);background:var(--panel);padding:18px}

/* Primary 里首页默认 fallback */
.primary-empty{margin-bottom:16px}
.primary-empty .title{font-size:16px;letter-spacing:1.5px;font-weight:700;color:var(--fg);margin:0 0 6px 0;text-transform:uppercase}
.primary-empty .sub{color:var(--dim);font-size:12px;line-height:1.6;margin:0 0 16px 0}
.primary-card{display:block;max-width:960px}
.primary-card .primary-head{margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.primary-card .primary-head .title{font-size:16px;letter-spacing:1.5px;color:var(--fg);font-weight:700;margin:0;text-transform:uppercase}
.primary-card .primary-head .sub{color:var(--dim);font-size:12px;margin-top:6px;line-height:1.6}
.sec-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.sec-item{padding:6px 8px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);color:var(--fg);font-size:11px;letter-spacing:.5px}
`;

type Slots = Record<string, SlotItem[]>;
interface SlotItem {
  id: string; label?: string; order?: number; icon?: string;
  payload?: Record<string, any>;
}

function getSlots(): Slots {
  const w = window as any;
  const raw = w.__VIBEPM_SLOTS__ ?? {};
  const out: Slots = {};
  for (const k of Object.keys(raw)) out[k] = Array.isArray(raw[k]) ? raw[k] : [];
  return out;
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

  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    this._root = this.shadowRoot!;
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
    brand.appendChild(iconEl("vibepm-logo", 22));
    const b = document.createElement("b");
    b.textContent = "vibepm";
    brand.appendChild(b);
    const small = document.createElement("small");
    small.textContent = "· minimal";
    brand.appendChild(small);
    const nav = document.createElement("nav");
    const iconFor = (rt: string): "settings" | "github" | "feed" | "plugins" | null => {
      switch (rt) {
        case "settings": return "settings";
        case "auth": return "github";
        case "feed": return "feed";
        case "plugins": return "plugins";
        default: return null;
      }
    };
    // Home 固定入口；其余导航项由 shell.primary 面板槽驱动（被禁用插件 → 面板消失 → 导航同步消失）
    const mkLink = (r: string, label: string, icon: "settings" | "github" | "feed" | "plugins" | null) => {
      const a = document.createElement("a");
      a.href = r ? `#${r}` : "#/";
      const isActive = r === route || (!r && !route);
      if (isActive) a.classList.add("active");
      if (icon) a.appendChild(iconEl(icon, 14));
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
      mkLink(r, String(pd.title ?? it.label ?? r), iconFor(r));
    }
    hd.append(brand, nav);
    return hd;
  }

  private mkMain(slots: Slots, route: string): HTMLElement {
    const main = document.createElement("div");
    main.className = "main";
    const navSec = document.createElement("section");
    navSec.className = "nav";
    this.renderNav(navSec, slots);
    const primary = document.createElement("section");
    primary.className = "primary";
    this.renderPrimary(primary, slots, route);
    const secondary = document.createElement("section");
    secondary.className = "secondary";
    this.renderSecondary(secondary, slots);
    main.append(navSec, primary, secondary);
    return main;
  }

  private renderNav(box: HTMLElement, slots: Slots): void {
    const items = (slots["shell.nav"] ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!items.length) {
      box.innerHTML = `<div class="nav-empty">（还没有插件注册 shell.nav · 请先加载 plugin-onboarding）</div>`;
      return;
    }
    const list = document.createElement("div");
    list.className = "nav-grid";
    for (const it of items) {
      const p: any = it.payload ?? {};
      if (p.kind === "nav-card") {
        const el = document.createElement("onboarding-nav-card");
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
      wrap.innerHTML = `<div class="title">Welcome</div>
        <div class="sub">从上方导航条（Home / Feed / GitHub / Settings）或下方卡片进入功能。所有功能均按插件方式装卸。</div>`;
      box.appendChild(wrap);
      const secondary = document.createElement("div");
      secondary.className = "nav-grid";
      const navItems = (slots["shell.nav"] ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const it of navItems) {
        const pp: any = it.payload ?? {};
        if (pp.kind === "nav-card") {
          const el = document.createElement("onboarding-nav-card");
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
    let body: HTMLElement;
    switch (kind) {
      case "github-auth-panel": body = document.createElement("github-auth-panel"); break;
      case "settings-panel": body = document.createElement("settings-panel"); break;
      case "feed-panel": body = document.createElement("feed-panel"); break;
      case "plugin-manager-panel": body = document.createElement("plugin-manager-panel"); break;
      default:
        body = document.createElement("div");
        body.className = "empty";
        body.innerHTML = `<b>未识别面板</b> kind=${kind || "—"}；未提供对应 <code>custom element</code>。`;
        break;
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
