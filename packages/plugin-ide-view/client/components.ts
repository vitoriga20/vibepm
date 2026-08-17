/**
 * vibe-topbar —— 顶部菜单条：左 logo + 菜单 menu slots；右 topbar-right slots（连接/同步…）
 */
import { iconEl, iconSVG } from "./icons.js";

const TOPBAR_CSS = `
:host{display:flex;align-items:stretch;justify-content:space-between;height:var(--bar-h);background:var(--panel);border-bottom:1px solid var(--line-strong);padding:0 10px}
.l,.r{display:flex;align-items:stretch;gap:2px}
.logo{display:flex;align-items:center;padding:0 8px;color:var(--accent)}
.logo .brand{font-weight:600;margin-left:6px;letter-spacing:1px;color:var(--fg)}
.menu-item{display:flex;align-items:center;padding:0 12px;cursor:pointer;border-radius:var(--radius);font-size:12px;color:var(--fg)}
.menu-item:hover{background:var(--panel-alt);color:var(--accent)}
.sep{width:1px;background:var(--line);margin:6px 4px}
.right-item{display:inline-flex;align-items:center;gap:6px;padding:0 10px;cursor:pointer;border-left:1px solid var(--line);border-right:1px solid var(--line);font-size:12px}
.right-item:last-child{border-right:none}
.right-item:hover{color:var(--accent);background:var(--panel-alt)}
.right-item i{color:var(--accent)}
.title{display:flex;align-items:center;margin:0 auto;font-size:12px;color:var(--dim);padding-right:10vw}
`;

export class VibeTopbar extends HTMLElement {
  constructor() { super(); }
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    const st = document.createElement("style");
    st.textContent = TOPBAR_CSS;
    const root = document.createElement("div");
    root.className = "host";
    const slots: any = (window as any).__VIBEPM_SLOTS__ ?? {};
    const left = document.createElement("div");
    left.className = "l";
    const logo = document.createElement("div");
    logo.className = "logo";
    logo.appendChild(iconEl("vibepm-logo", 22));
    const b = document.createElement("span");
    b.className = "brand";
    b.textContent = "VIBEPM";
    logo.appendChild(b);
    left.appendChild(logo);
    const sep1 = document.createElement("div");
    sep1.className = "sep";
    left.appendChild(sep1);
    for (const m of (slots["topbar-menu"] ?? []) as any[]) {
      const d = document.createElement("div");
      d.className = "menu-item";
      d.textContent = m.label ?? m.id;
      d.dataset.menu = m.id;
      left.appendChild(d);
    }
    const mid = document.createElement("div");
    mid.className = "title";
    mid.textContent = "项目工作台";
    const right = document.createElement("div");
    right.className = "r";
    for (const r of (slots["topbar-right"] ?? []) as any[]) {
      const d = document.createElement("div");
      d.className = "right-item";
      d.title = r.label ?? r.id;
      if (r.icon) d.appendChild(iconEl(r.icon as any, 14));
      const t = document.createElement("span");
      t.textContent = r.label ?? r.id;
      d.appendChild(t);
      right.appendChild(d);
    }
    this.shadowRoot!.append(st, left, mid, right);
  }
}

/**
 * vibe-activity-bar —— 左 48px 图标条。单击时切 activity；写 window.__VIBEPM_STATE__.activityId + 派发 activity-change 事件
 */
const ACT_BAR_CSS = `
:host{width:var(--activity-w);background:var(--panel-alt);border-right:1px solid var(--line-strong);display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:6px 0;flex-shrink:0}
.col{display:flex;flex-direction:column;align-items:center;gap:4px}
.item{width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:var(--dim);cursor:pointer;border-left:2px solid transparent;border-radius:var(--radius);position:relative}
.item:hover{color:var(--fg);background:var(--panel)}
.item.active{color:var(--accent);border-left-color:var(--accent)}
.item .badge{position:absolute;top:4px;right:4px;width:6px;height:6px;border-radius:50%;background:var(--warn);display:none}
.item[data-badge="1"] .badge{display:block}
.decor{width:22px;height:22px;color:var(--accent-dim);opacity:0.6}
`;

export class VibeActivityBar extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    const st = document.createElement("style");
    st.textContent = ACT_BAR_CSS;
    const top = document.createElement("div");
    top.className = "col";
    const bottom = document.createElement("div");
    bottom.className = "col";
    const slots: any = (window as any).__VIBEPM_SLOTS__ ?? {};
    const items = [...(slots["activity-bar"] ?? [])] as any[];
    // account 之类（order>500 或 payload.bottom）放底栏
    const tops = items.filter((x) => !x.payload?.bottom && (x.order ?? 50) < 500);
    const bots = items.filter((x) => x.payload?.bottom || (x.order ?? 50) >= 500);
    let firstId: string | null = null;
    const mk = (i: any) => {
      const d = document.createElement("div");
      d.className = "item";
      d.title = i.label ?? i.id;
      d.dataset.id = i.id;
      if (i.icon) d.appendChild(iconEl(i.icon as any, 20));
      else d.textContent = i.id.slice(0, 1).toUpperCase();
      const b = document.createElement("span");
      b.className = "badge";
      d.appendChild(b);
      if (!firstId) firstId = i.id;
      d.onclick = () => this._setActive(i.id);
      return d;
    };
    for (const t of tops) top.appendChild(mk(t));
    for (const b of bots) bottom.appendChild(mk(b));
    const deco = document.createElement("div");
    deco.className = "decor";
    deco.appendChild(iconEl("cross-star", 22));
    bottom.appendChild(deco);
    this.shadowRoot!.append(st, top, bottom);
    // 默认选中第一个
    if (firstId) this._setActive(firstId);
  }
  private _setActive(id: string): void {
    for (const el of this.shadowRoot!.querySelectorAll<HTMLElement>(".item")) {
      el.classList.toggle("active", el.dataset.id === id);
    }
    const st: any = (window as any).__VIBEPM_STATE__ = (window as any).__VIBEPM_STATE__ ?? {};
    st.activityId = id;
    window.dispatchEvent(new CustomEvent("vibe:activity-change", { detail: { id } }));
  }
}

/**
 * vibe-sidebar —— 左 260px 树侧栏。按 activityId 切换显示的 panel（来自 slots）。
 */
const SIDEBAR_CSS = `
:host{width:var(--sidebar-w);background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;flex-shrink:0;min-width:0}
.header{padding:8px 12px;font-size:11px;letter-spacing:1.5px;color:var(--dim);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}
.header .title{display:inline-flex;align-items:center;gap:6px}
.tree{flex:1;overflow:auto;padding:6px 4px;font-size:12px}
.tree-node{padding:2px 8px;display:flex;align-items:center;gap:6px;cursor:pointer;border-radius:var(--radius);color:var(--fg);white-space:nowrap}
.tree-node:hover{background:var(--panel-alt)}
.tree-node .label{overflow:hidden;text-overflow:ellipsis}
.tree-node.muted{color:var(--dim)}
.tree .group{margin-top:6px;padding:0 8px;color:var(--accent);font-size:11px;letter-spacing:1px;margin-bottom:2px}
.empty{color:var(--dim);padding:16px 14px;font-size:12px}
.actions{display:flex;gap:4px}
.icon-btn{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--radius);color:var(--dim);cursor:pointer;background:transparent;border:1px solid transparent}
.icon-btn:hover{color:var(--fg);border-color:var(--line)}
`;

export class VibeSidebar extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    const st = document.createElement("style");
    st.textContent = SIDEBAR_CSS;
    const host = document.createElement("div");
    host.style.cssText = "display:flex;flex-direction:column;height:100%";
    const header = document.createElement("div");
    header.className = "header";
    const title = document.createElement("span");
    title.className = "title";
    const actions = document.createElement("span");
    actions.className = "actions";
    const plus = document.createElement("span"); plus.className = "icon-btn"; plus.title = "新建"; plus.appendChild(iconEl("plus", 12)); actions.appendChild(plus);
    const sr = document.createElement("span"); sr.className = "icon-btn"; sr.title = "刷新"; sr.appendChild(iconEl("refresh", 12)); actions.appendChild(sr);
    header.append(title, actions);
    const tree = document.createElement("div");
    tree.className = "tree";
    host.append(header, tree);
    this.shadowRoot!.append(st, host);
    this._render = this._render.bind(this);
    window.addEventListener("vibe:activity-change", this._render as any);
    this._render();
  }
  disconnectedCallback(): void {
    window.removeEventListener("vibe:activity-change", this._render as any);
  }
  _render(): void {
    const host = this.shadowRoot!.lastElementChild as HTMLElement;
    const header = host.firstElementChild as HTMLElement;
    const title = header.firstElementChild as HTMLElement;
    const tree = host.lastElementChild as HTMLElement;
    tree.innerHTML = "";
    const state: any = (window as any).__VIBEPM_STATE__ ?? {};
    const activityId: string = state.activityId ?? "explorer";
    const slots: any = (window as any).__VIBEPM_SLOTS__ ?? {};
    const panels = (slots["sidebar-panels"] ?? []) as any[];
    const panel = panels.find((p) => (p.payload?.activityId ?? p.id) === activityId);
    title.innerHTML = "";
    if (panel?.icon) title.appendChild(iconEl(panel.icon as any, 12));
    const t = document.createElement("span");
    t.textContent = (panel?.label ?? activityId).toUpperCase();
    title.appendChild(t);
    // 不同 activity 渲染不同占位树结构（首屏，纯静态结构，后续再挂真实数据）
    if (activityId === "explorer") this._renderExplorer(tree);
    else if (activityId === "todos") this._renderTodos(tree);
    else if (activityId === "source") this._renderSource(tree);
    else if (activityId === "search") this._renderSearch(tree);
    else this._empty(tree, activityId);
  }
  private _renderExplorer(tree: HTMLElement): void {
    this._group(tree, "工作区 · 我的仓库");
    this._folder(tree, "vibepm", true);
    this._file(tree, "package.json");
    this._file(tree, "README.md");
    this._file(tree, "task_plan.md");
    this._folder(tree, "docs", false);
    this._folder(tree, "src", false);
    this._folder(tree, "另一个仓库", false);
  }
  private _renderTodos(tree: HTMLElement): void {
    this._group(tree, "待处理 · 5");
    this._todo(tree, "完成 IDE 初始界面", false, "高");
    this._todo(tree, "接入 GitHub 设备码登录", false, "中");
    this._todo(tree, "重构字段插件为独立包", false, "中");
    this._todo(tree, "写首屏欢迎引导页", true,  "低");
    this._todo(tree, "迁移 Python 测试到 TS", false, "低");
  }
  private _renderSource(tree: HTMLElement): void {
    this._group(tree, "同步状态");
    this._row(tree, "上次同步", "12 分钟前");
    this._row(tree, "未提交变更", "3 个文件");
    this._row(tree, "待 push", "0");
    this._row(tree, "分支", "main");
    this._group(tree, "最近变更");
    this._row(tree, "chore: 拆 monorepo 骨架", "2h 前");
    this._row(tree, "feat: slots 注册表", "昨天");
  }
  private _renderSearch(tree: HTMLElement): void {
    this._group(tree, "搜索");
    const hint = document.createElement("div");
    hint.className = "empty";
    hint.style.padding = "6px 8px";
    hint.textContent = "在顶部菜单编辑 → 查找 触发搜索框（占位）";
    tree.appendChild(hint);
  }
  private _empty(tree: HTMLElement, id: string): void {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = `面板 ${id} 待开发 (⌒_⌒;)`;
    tree.appendChild(d);
  }
  private _group(tree: HTMLElement, name: string): void {
    const g = document.createElement("div");
    g.className = "group";
    g.textContent = name;
    tree.appendChild(g);
  }
  private _folder(tree: HTMLElement, name: string, open: boolean): void {
    const n = document.createElement("div");
    n.className = "tree-node";
    n.style.paddingLeft = "16px";
    n.appendChild(iconEl(open ? "chevron-down" : "chevron-right", 10));
    n.appendChild(iconEl(open ? "folder-open" : "folder-closed", 14));
    const l = document.createElement("span"); l.className = "label"; l.textContent = name;
    n.appendChild(l);
    tree.appendChild(n);
  }
  private _file(tree: HTMLElement, name: string): void {
    const n = document.createElement("div");
    n.className = "tree-node muted";
    n.style.paddingLeft = "42px";
    n.appendChild(iconEl("file", 14));
    const l = document.createElement("span"); l.className = "label"; l.textContent = name;
    n.appendChild(l);
    tree.appendChild(n);
  }
  private _todo(tree: HTMLElement, title: string, done: boolean, pri: string): void {
    const n = document.createElement("div");
    n.className = "tree-node" + (done ? " muted" : "");
    n.style.paddingLeft = "16px";
    const box = document.createElement("span");
    box.style.cssText = `width:14px;height:14px;border:1px solid ${done ? "var(--accent)" : "var(--line-strong)"};display:inline-block;border-radius:2px;position:relative;flex-shrink:0`;
    if (done) { box.style.background = "var(--accent-dim)"; const ck = document.createElement("span"); ck.style.cssText = "position:absolute;inset:0 0 2px 3px;width:6px;height:10px;border:solid var(--accent);border-width:0 1.5px 1.5px 0;transform:rotate(45deg)"; box.appendChild(ck); }
    n.appendChild(box);
    const tag = document.createElement("span");
    tag.style.cssText = `font-size:10px;padding:1px 5px;border-radius:2px;margin-right:6px;${pri === "高" ? "background:#3a1a1a;color:#e08a8a" : pri === "中" ? "background:#3a2e14;color:#ffd483" : "background:#14263a;color:#8ec9ff"}`;
    tag.textContent = pri;
    n.appendChild(tag);
    const l = document.createElement("span"); l.className = "label"; l.textContent = title; l.style.textDecoration = done ? "line-through" : "";
    n.appendChild(l);
    tree.appendChild(n);
  }
  private _row(tree: HTMLElement, k: string, v: string): void {
    const n = document.createElement("div");
    n.className = "tree-node";
    n.style.paddingLeft = "16px";
    n.style.justifyContent = "space-between";
    const lk = document.createElement("span"); lk.className = "label muted"; lk.style.flexShrink = "0"; lk.textContent = k;
    const lv = document.createElement("span"); lv.className = "label"; lv.textContent = v;
    n.append(lk, lv);
    tree.appendChild(n);
  }
}

/**
 * vibe-editor —— 主编区（上方 tabs + 中间 tab 内容）
 */
const EDITOR_CSS = `
:host{flex:1;min-width:0;background:var(--bg);display:flex;flex-direction:column;border-right:1px solid var(--line)}
.tabs{display:flex;border-bottom:1px solid var(--line);background:var(--panel-alt);min-height:32px;align-items:flex-end;padding:0 6px;overflow-x:auto}
.tab{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--panel);border:1px solid var(--line);border-bottom:none;border-top-left-radius:var(--radius);border-top-right-radius:var(--radius);margin-right:3px;font-size:12px;color:var(--dim);cursor:pointer;white-space:nowrap;max-width:200px}
.tab.active{color:var(--fg);background:var(--bg);border-top:1px solid var(--accent)}
.tab .close{color:var(--dim);display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;border-radius:2px}
.tab .close:hover{background:var(--line-strong);color:var(--fg)}
.tabs .spacer{flex:1;border-bottom:1px solid var(--line)}
.content{flex:1;overflow:auto;padding:22px 30px;max-width:100%;font-size:13px;line-height:1.6}
.welcome{max-width:880px;margin:0 auto}
.hero{display:flex;gap:24px;align-items:center;padding:16px 18px;border:1px solid var(--line);border-radius:6px;background:linear-gradient(145deg, var(--panel) 0%, var(--panel-alt) 100%)}
.hero .logo{width:56px;height:56px;color:var(--accent);flex-shrink:0}
.hero h1{font-size:18px;font-weight:600;margin-bottom:4px;color:var(--fg)}
.hero p{color:var(--dim);font-size:12px;margin-bottom:6px}
.hero .kbd{font-size:11px;padding:1px 5px;border:1px solid var(--line-strong);border-radius:3px;background:var(--panel);color:var(--fg)}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:18px}
.card{padding:14px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel)}
.card h3{font-size:12px;color:var(--accent);letter-spacing:1px;margin-bottom:8px;text-transform:uppercase;display:flex;align-items:center;gap:6px}
.card ul{list-style:none;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--fg)}
.card li{display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px dashed var(--line)}
.card li:last-child{border-bottom:none}
.card li .k{color:var(--dim)}
.placeholder-other{margin-top:18px;padding:30px;border:1px dashed var(--line-strong);border-radius:var(--radius);text-align:center;color:var(--dim);font-size:12px}
`;

export class VibeEditor extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    const st = document.createElement("style");
    st.textContent = EDITOR_CSS;
    const tabs = document.createElement("div");
    tabs.className = "tabs";
    const slots: any = (window as any).__VIBEPM_SLOTS__ ?? {};
    const tabList = (slots["main-tabs"] ?? []) as any[];
    let first: string | null = null;
    for (const t of tabList) {
      const el = document.createElement("div");
      el.className = "tab";
      el.dataset.id = t.id;
      el.textContent = t.label ?? t.id;
      const c = document.createElement("span");
      c.className = "close";
      c.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6 l12 12 M18 6 L6 18"/></svg>`;
      el.appendChild(c);
      if (!first) first = t.id;
      el.onclick = () => this._activate(t.id);
      tabs.appendChild(el);
    }
    const sp = document.createElement("div"); sp.className = "spacer"; tabs.appendChild(sp);
    const content = document.createElement("div");
    content.className = "content";
    this.shadowRoot!.append(st, tabs, content);
    if (first) this._activate(first);
  }
  _activate(id: string): void {
    const tabs = this.shadowRoot!.querySelector<HTMLElement>(".tabs")!;
    for (const t of tabs.querySelectorAll<HTMLElement>(".tab")) {
      t.classList.toggle("active", t.dataset.id === id);
    }
    const content = this.shadowRoot!.querySelector<HTMLElement>(".content")!;
    content.innerHTML = "";
    if (id === "overview") content.appendChild(this._overview());
    else if (id === "plan") content.appendChild(this._plan());
    else if (id === "fields") content.appendChild(this._fields());
    else if (id === "notes") content.appendChild(this._notes());
    else content.appendChild(this._placeholder(id));
  }
  private _overview(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "welcome";
    const hero = document.createElement("div");
    hero.className = "hero";
    const logo = document.createElement("div");
    logo.className = "logo";
    logo.appendChild(iconEl("vibepm-logo", 56));
    const text = document.createElement("div");
    text.style.flex = "1";
    const h1 = document.createElement("h1"); h1.textContent = "欢迎来到 VibePM · 项目工作台";
    const p1 = document.createElement("p");
    p1.innerHTML = `一个「一切皆插件」的个人 GitHub 项目管理器。IDE 风格界面，<span class="kbd">Ctrl</span> + <span class="kbd">P</span> 快捷命令，<span class="kbd">Ctrl</span> + <span class="kbd">B</span> 切换左侧栏。`;
    const p2 = document.createElement("p");
    p2.innerHTML = `右侧顶部 <b>连接 GitHub</b> 授权后自动同步你的仓库数据。`;
    text.append(h1, p1, p2);
    hero.append(logo, text);

    const grid = document.createElement("div");
    grid.className = "grid";
    grid.append(
      this._card("活跃度指标", [
        ["Stars", "-"],
        ["Forks", "-"],
        ["30 天 Commits", "-"],
        ["Open Issues", "-"],
        ["Open PRs", "-"],
        ["Releases", "-"],
      ]),
      this._card("进度一览", [
        ["阶段", "初始化 · IDE 骨架"],
        ["本地 TODO", "5 / 0 完成"],
        ["目标", "待设置"],
        ["优先级", "中"],
        ["标签", "无"],
        ["上次同步", "-"],
      ]),
    );
    wrap.append(hero, grid);
    return wrap;
  }
  private _plan(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "welcome";
    wrap.innerHTML = `<div class="card" style="border-color:var(--accent-dim)">
      <h3 style="display:flex;align-items:center;gap:6px;color:var(--accent);letter-spacing:1px;font-size:12px;text-transform:uppercase;margin-bottom:10px">
        <span style="display:inline-flex">${iconSVG("checklist").replace(/<svg /, '<svg width="14" height="14" ')}</span>
        执行计划 · 折叠视图
      </h3>
      <ul style="list-style:none;display:flex;flex-direction:column;gap:10px;font-size:12px">
        ${[
          ["Step 1", "拆 monorepo 骨架 + manifest 扫描 + slots + client modules", true],
          ["Step 2", "IDE 风格初始界面（6 区域布局 + 默认 slots）", false],
          ["Step 3", "接入真实项目数据（字段插件独立包）", false],
          ["Step 4", "GitHub 设备码登录 + 同步链路", false],
          ["Step 5", "端到端自测 + 文档 + npm publish", false],
        ].map(([n, t, ok]: any) => `
          <li style="display:flex;gap:10px;align-items:flex-start;padding:6px 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel-alt)">
            <span style="flex-shrink:0;padding:2px 6px;border-radius:2px;background:${ok ? "var(--accent-dim)" : "var(--panel)"};color:${ok ? "var(--accent)" : "var(--dim)"};border:1px solid ${ok ? "var(--accent-line)" : "var(--line-strong)"};font-size:11px">${n}</span>
            <span style="flex:1;color:${ok ? "var(--dim);text-decoration:line-through" : "var(--fg)"}">${t}</span>
            <span style="flex-shrink:0;color:${ok ? "var(--accent)" : "var(--warn)"}">${ok ? "DONE" : "TODO"}</span>
          </li>
        `).join("")}
      </ul>
    </div>`;
    return wrap.firstElementChild as HTMLElement;
  }
  private _fields(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "welcome";
    wrap.innerHTML = `
    <div class="card">
      <h3>项目字段 · 占位</h3>
      <div style="display:grid;grid-template-columns:160px 1fr;gap:10px 14px;font-size:12px">
        <div style="color:var(--dim)">一句话目标</div>
        <div><input value="完成 IDE 风格初始界面并跑通链路" style="width:100%;background:var(--bg);border:1px solid var(--line-strong);padding:6px 8px;border-radius:var(--radius);font:inherit;color:var(--fg)" /></div>
        <div style="color:var(--dim)">状态</div>
        <div><select style="width:100%;background:var(--bg);border:1px solid var(--line-strong);padding:6px 8px;border-radius:var(--radius);font:inherit;color:var(--fg)">
          <option>进行中</option><option>已暂停</option><option>已完成</option><option>已归档</option></select></div>
        <div style="color:var(--dim)">优先级</div>
        <div><select style="width:100%;background:var(--bg);border:1px solid var(--line-strong);padding:6px 8px;border-radius:var(--radius);font:inherit;color:var(--fg)">
          <option>高</option><option selected>中</option><option>低</option></select></div>
        <div style="color:var(--dim)">标签</div>
        <div><input value="IDE, slots, monorepo" style="width:100%;background:var(--bg);border:1px solid var(--line-strong);padding:6px 8px;border-radius:var(--radius);font:inherit;color:var(--fg)" /></div>
      </div>
    </div>`;
    return wrap.firstElementChild as HTMLElement;
  }
  private _notes(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "welcome";
    wrap.innerHTML = `
    <div class="card">
      <h3>备注 / 反思 · 占位</h3>
      <textarea placeholder="在这里记录该项目的思路、问题、决策…" style="width:100%;min-height:260px;background:var(--bg);border:1px solid var(--line-strong);padding:10px 12px;border-radius:var(--radius);font:inherit;color:var(--fg);resize:vertical;margin-top:8px">- 界面风格：墨绿单一强调色，硬分割线，小圆角，无渐变无大阴影
- 图标：line 几何 + 蛇形 logo
- 布局：VS Code（顶 bar / Activity / Sidebar / Editor / Right / Status）
- 机制：插件 -> slots 注册表 -> Web Components 渲染
</textarea>
    </div>`;
    return wrap.firstElementChild as HTMLElement;
  }
  private _placeholder(id: string): HTMLElement {
    const d = document.createElement("div");
    d.className = "placeholder-other";
    d.textContent = `tab "${id}" 内容占位：后续由插件注册 widget 渲染。`;
    return d;
  }
  private _card(h: string, rows: Array<[string, string]>): HTMLElement {
    const c = document.createElement("div");
    c.className = "card";
    const t = document.createElement("h3");
    t.innerHTML = iconSVG("cross-star").replace(/<svg /, '<svg width="10" height="10" style="color:var(--accent)" ') + `<span>${h}</span>`;
    const ul = document.createElement("ul");
    for (const [k, v] of rows) {
      const li = document.createElement("li");
      const kk = document.createElement("span"); kk.className = "k"; kk.textContent = k;
      const vv = document.createElement("span"); vv.textContent = v;
      li.append(kk, vv);
      ul.appendChild(li);
    }
    c.append(t, ul);
    return c;
  }
}

/**
 * vibe-right-panel —— 右侧面板（tabs 切换：stats/timeline 占位）
 */
const RIGHT_CSS = `
:host{width:var(--right-w);background:var(--panel);border-left:1px solid var(--line);display:flex;flex-direction:column;flex-shrink:0}
.tabs{display:flex;border-bottom:1px solid var(--line);background:var(--panel-alt)}
.tab{padding:7px 12px;font-size:12px;color:var(--dim);cursor:pointer;border-bottom:2px solid transparent}
.tab.active{color:var(--fg);border-bottom-color:var(--accent)}
.body{flex:1;overflow:auto;padding:12px 14px;font-size:12px}
.stat-block{margin-bottom:14px}
.stat-block .h{font-size:10px;color:var(--accent);letter-spacing:1.5px;margin-bottom:6px;text-transform:uppercase;display:flex;align-items:center;gap:5px}
.stat-block .k{color:var(--dim);font-size:11px;margin-top:4px}
.stat-block .v{font-size:15px;color:var(--fg);font-weight:500}
.stat-block .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-top:4px}
.bar{margin-top:6px;height:4px;background:var(--panel-alt);border-radius:2px;overflow:hidden;border:1px solid var(--line)}
.bar > span{display:block;height:100%;background:var(--accent)}
.tl{display:flex;flex-direction:column;gap:6px}
.tl .it{display:flex;gap:8px;font-size:11px;padding:4px 0;border-bottom:1px dashed var(--line)}
.tl .it .dt{color:var(--dim);flex-shrink:0;width:44px}
.tl .it .ev{flex:1;color:var(--fg)}
.tl .it:last-child{border-bottom:none}
`;

export class VibeRightPanel extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    const st = document.createElement("style");
    st.textContent = RIGHT_CSS;
    const tabs = document.createElement("div");
    tabs.className = "tabs";
    const slots: any = (window as any).__VIBEPM_SLOTS__ ?? {};
    const panels = (slots["right-panels"] ?? []) as any[];
    let firstId: string | null = null;
    for (const p of panels) {
      const d = document.createElement("div");
      d.className = "tab";
      d.dataset.id = p.id;
      d.textContent = p.label ?? p.id;
      d.onclick = () => this._activate(p.id);
      if (!firstId) firstId = p.id;
      tabs.appendChild(d);
    }
    const body = document.createElement("div");
    body.className = "body";
    this.shadowRoot!.append(st, tabs, body);
    if (firstId) this._activate(firstId);
  }
  private _activate(id: string): void {
    const tabs = this.shadowRoot!.querySelector(".tabs") as HTMLElement;
    for (const t of tabs.querySelectorAll<HTMLElement>(".tab")) t.classList.toggle("active", t.dataset.id === id);
    const body = this.shadowRoot!.querySelector(".body") as HTMLElement;
    body.innerHTML = "";
    if (id === "stats") body.appendChild(this._stats());
    else if (id === "timeline") body.appendChild(this._timeline());
  }
  private _stats(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="stat-block">
        <div class="h">${iconSVG("cross-star").replace(/<svg /, '<svg width="8" height="8" style="color:var(--accent)" ')} 概览</div>
        <div class="grid">
          <div><div class="k">Stars</div><div class="v">0</div></div>
          <div><div class="k">Forks</div><div class="v">0</div></div>
          <div><div class="k">Issues</div><div class="v">0 / 0 open</div></div>
          <div><div class="k">PRs</div><div class="v">0 / 0 open</div></div>
        </div>
      </div>
      <div class="stat-block">
        <div class="h">进度</div>
        <div class="k">初始化阶段（2 / 5）</div>
        <div class="bar"><span style="width:40%"></span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-top:10px">
          <div><div class="k">本地 TODO</div><div class="v">0 / 5</div></div>
          <div><div class="k">字段配置率</div><div class="v">40%</div></div>
        </div>
      </div>
      <div class="stat-block">
        <div class="h">活跃度（近 30 天）</div>
        <div class="k">commits 0 · releases 0</div>
        <div class="bar"><span style="width:0%"></span></div>
      </div>`;
    return wrap;
  }
  private _timeline(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "tl";
    const rows: Array<[string, string]> = [
      ["— now", "创建 IDE 初始界面骨架（6 区域布局）"],
      ["10m", "Slots 注册表就绪（activity/side/top/right/status）"],
      ["1h",  "拆 monorepo 5 个包 + 新版 loader"],
      ["—",   "连接 GitHub 授权（待）"],
    ];
    for (const [t, e] of rows) {
      const d = document.createElement("div");
      d.className = "it";
      const dt = document.createElement("span"); dt.className = "dt"; dt.textContent = t;
      const ev = document.createElement("span"); ev.className = "ev"; ev.textContent = e;
      d.append(dt, ev);
      wrap.appendChild(d);
    }
    return wrap;
  }
}

/**
 * vibe-statusbar —— 底部状态栏（左 slots；右 slots）；背景用墨绿 accent。
 */
const STATUS_CSS = `
:host{height:var(--status-h);background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-size:11px}
.l,.r{display:flex;align-items:center;gap:2px;height:100%}
.item{padding:0 8px;display:inline-flex;align-items:center;gap:5px;height:100%;cursor:pointer;position:relative}
.item:hover{background:rgba(255,255,255,0.09)}
.item + .item::before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:1px;background:rgba(255,255,255,0.2)}
.sep{width:6px}
.icon{display:inline-flex;color:#fff;width:12px;height:12px;align-items:center;justify-content:center}
`;

export class VibeStatusbar extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    const st = document.createElement("style");
    st.textContent = STATUS_CSS;
    const left = document.createElement("div");
    const right = document.createElement("div");
    left.className = "l"; right.className = "r";
    const slots: any = (window as any).__VIBEPM_SLOTS__ ?? {};
    const mk = (it: any) => {
      const d = document.createElement("div");
      d.className = "item";
      if (it.payload?.kind === "conn-state") {
        d.innerHTML = `<span class="icon">${circleSVG()}</span>`;
        const s = document.createElement("span"); s.textContent = it.label ?? it.id;
        d.appendChild(s);
      } else if (it.payload?.kind === "listen-port") {
        const s = document.createElement("span");
        // 从当前 URL 取端口
        s.textContent = `:${location.port || "8080"}`;
        d.appendChild(s);
      } else {
        if (it.icon) d.appendChild(Object.assign(document.createElement("span"), { className: "icon", innerHTML: iconSVGWrap(it.icon) }));
        const s = document.createElement("span"); s.textContent = it.label ?? it.id;
        d.appendChild(s);
      }
      return d;
    };
    for (const it of (slots["statusbar-left"] ?? []) as any[]) left.appendChild(mk(it));
    for (const it of (slots["statusbar-right"] ?? []) as any[]) right.appendChild(mk(it));
    this.shadowRoot!.append(st, left, right);
  }
}

function circleSVG(): string {
  return `<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>`;
}
function iconSVGWrap(name: string): string {
  return iconSVG(name as any).replace(/<svg /, '<svg width="12" height="12" style="display:block" ');
}
