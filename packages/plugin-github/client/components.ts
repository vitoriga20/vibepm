/**
 * plugin-github · client 组件三件套 + 面板头像
 *  - 样式「不硬编码」：颜色一律 var(--xxx) 走壳主题 token（穿透 Shadow DOM 自动跟随皮肤，同 ambient）；
 *    字体走 --display-cjk / --mono，圆角走 --radius / --radius-s，阴影走 --shadow-panel。
 *  - 文案全部来自 constants.ts 的 TEXT；语言色来自 LANG_COLORS；图标/事件类型/时间单位来自常量。
 *  - 布局数值（间距/字号/宽高）为组件局部设计规范，集中在本文件，可后续抽 token，不做第二处书写。
 */
import {
  API_PREFIX, HASH_AUTH, HASH_REPOS, HASH_REPO,
  PANEL_KIND_AUTH, PANEL_KIND_REPOS, PANEL_KIND_DETAIL, PANEL_KIND_AVATAR,
  R_SUB_THRESHOLDS,
  K_ACTIVE_WINDOW_DAYS, K_ACTIVE_MIN_COMMITS, K_ACTIVE_RECENT_DAYS,
  ACTIVE_WINDOW_DAYS, ACTIVE_MIN_COMMITS, ACTIVE_RECENT_DAYS, DEVICE_POLL_INTERVAL_S,
  SEC, MIN, HOUR, DAY, MONTH, SHORT_SHA_LEN,
  EVENT_CLASSIFY, ICONS, LANG_COLORS, LANG_COLOR_FALLBACK, REL_UNITS, TEXT,
} from "./constants.js";

/** 阈值变更事件（头像设置弹层 → 仓库列表刷新；window 级解耦通信） */
export const EVT_THRESHOLDS = "vibepm:github:thresholds";

/* ============================================================
   CSS（全 token，无硬编码色值）
   ============================================================ */
const CSS = /* css */`
:host{display:block;position:relative}
h1{font-size:16px;letter-spacing:1.5px;color:var(--ink);margin:0;font-weight:900;text-transform:uppercase;font-family:var(--display-cjk)}
.desc{font-size:12px;color:var(--dim);margin:6px 0 16px;line-height:1.6}
.ptitle{display:flex;align-items:center;gap:12px;margin-bottom:2px;position:relative}
.ptitle h1{flex:0 0 auto}
/* 头像右顶格：贴面板标题行右上角（absolute，不受 h1 宽度影响） */
.ptitle github-avatar{position:absolute;top:0;right:0}
.status{display:inline-block;padding:4px 9px;font:700 9px/1 var(--mono);letter-spacing:1px;border:1px solid var(--line-strong);color:var(--dim);text-transform:uppercase;background:var(--panel)}
.status.on{color:var(--on-ink);border-color:var(--accent);background:var(--accent)}
.status.off{color:var(--warn);border-color:var(--warn);background:var(--panel-alt)}
.card{border:1px solid var(--line-strong);border-left:4px solid var(--accent);background:var(--panel);color:var(--ink);padding:14px 16px;margin-top:10px;border-radius:var(--radius-s)}
.who{display:flex;align-items:center;gap:10px}
.avatar-inline{width:34px;height:34px;border-radius:50%;background:var(--accent-dim);color:var(--accent);display:flex;align-items:center;justify-content:center;font:900 13px/1 var(--mono);border:1px solid var(--accent-line)}
.form{border:1px dashed var(--line-strong);border-left:3px solid var(--accent);background:var(--panel);padding:14px 16px;margin-top:8px;border-radius:var(--radius-s)}
.h-sec{font:700 10px/1 var(--mono);color:var(--dim);letter-spacing:1.2px;text-transform:uppercase;margin:0 0 10px 0}
label{font:600 10px/1 var(--mono);color:var(--dim);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:6px}
input[type=text],input[type=password],input[type=number]{width:100%;background:var(--panel);border:1px solid var(--line-strong);border-left:3px solid var(--accent);color:var(--ink);font:12px/1 var(--mono);padding:8px 10px;border-radius:var(--radius-s);outline:none}
input:focus{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
button{border:1px solid var(--line-strong);border-left:3px solid var(--accent);background:var(--panel);color:var(--ink);padding:7px 14px;cursor:pointer;font:700 11px/1 var(--display-cjk);letter-spacing:.5px;border-radius:var(--radius-s);transition:color .18s,border-color .18s}
button:hover{border-color:var(--accent);color:var(--accent)}
button.primary{background:var(--accent);border-color:var(--accent);border-left-color:var(--accent-2);color:var(--on-ink)}
button.primary:hover{background:var(--accent-2);color:var(--on-ink)}
button.ghost{border-style:dashed}
.btnrow{display:flex;gap:8px;align-items:center;margin-top:10px}
.row{display:flex;gap:12px}
.row .field{flex:1}
code.big{font:700 18px/1 var(--mono);color:var(--accent);letter-spacing:2px}
a.link{color:var(--accent);font-size:12px;text-decoration:none}
a.link:hover{text-decoration:underline}
.msg{font:11px/1 var(--mono);color:var(--muted)}
.msg.ok{color:var(--accent)}.msg.err{color:var(--danger)}
/* 头像（面板 h1 右侧） */
.avatar-wrap{position:relative;margin-left:auto;display:flex;align-items:center}
.avatar-btn{width:38px;height:38px;border-radius:50%;border:2px solid var(--accent);background:var(--accent-dim);color:var(--accent);font:900 15px/1 var(--mono);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-panel);cursor:pointer;position:relative;padding:0}
.avatar-btn .dot{position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:var(--ink-ok);border:2px solid var(--panel)}
.avatar-menu{position:absolute;top:44px;right:0;width:240px;background:var(--panel);border:1px solid var(--line-strong);border-left:4px solid var(--accent);border-radius:var(--radius);box-shadow:var(--shadow-panel);display:none;overflow:hidden;z-index:10}
.avatar-wrap.open .avatar-menu{display:block}
.am-user{padding:12px 14px;border-bottom:1px solid var(--line);background:var(--panel-alt)}
.am-name{font:700 13px/1.4 var(--display-cjk);color:var(--ink)}
.am-name span{color:var(--dim);font-weight:400;font-family:var(--mono);font-size:11px}
.am-src{font:11px/1 var(--mono);color:var(--muted);margin-top:4px}
.am-item{display:block;width:100%;text-align:left;border:none;border-bottom:1px solid var(--line);background:var(--panel);color:var(--ink);padding:10px 14px;font:600 12px/1 var(--display-cjk);border-radius:0}
.am-item:hover{background:var(--accent-dim);color:var(--accent)}
.am-item.am-danger{color:var(--danger)}
.am-item.am-danger:hover{background:var(--panel-alt);color:var(--danger)}
/* 设置弹层 */
.modal-mask{position:fixed;inset:0;background:color-mix(in srgb, var(--ink) 35%, transparent);display:none;align-items:center;justify-content:center;z-index:100}
.modal-mask.open{display:flex}
.modal{width:min(420px,90vw);background:var(--panel);border:1px solid var(--line-strong);border-top:4px solid var(--accent);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow-panel)}
.modal h3{font:900 13px/1 var(--display-cjk);color:var(--ink);letter-spacing:1px;margin-bottom:6px}
/* 仓库列表 */
.statline{display:flex;gap:8px;align-items:center;margin:14px 0 12px;font:600 12px/1 var(--display-cjk);color:var(--muted)}
.statline b{color:var(--accent);font-family:var(--mono)}
.zhead{display:flex;align-items:baseline;gap:8px;margin:16px 0 8px;padding-left:10px;border-left:3px solid var(--accent);cursor:pointer}
.zhead h2{font:700 12px/1 var(--mono);color:var(--ink);letter-spacing:1px}
.zhead .cnt{font:11px/1 var(--mono);color:var(--dim)}
.zhead .caret{color:var(--dim);font-size:10px;transition:transform .15s}
.zhead.open .caret{transform:rotate(90deg)}
.repo{border:1px solid var(--line);background:var(--panel);padding:10px 12px;margin-bottom:6px;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;border-radius:var(--radius-s);transition:border-color .15s}
.repo:hover{border-color:var(--accent)}
.repo .nm{font:700 12px/1 var(--mono);color:var(--ink)}
.repo .nm .tag{font:600 9px/1 var(--mono);color:var(--dim);border:1px solid var(--line);padding:1px 4px;margin-left:4px;border-radius:2px}
.repo .ds{font-size:11px;color:var(--dim);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.repo .meta{font:11px/1.6 var(--mono);color:var(--dim);text-align:right}
.repo .meta .acc{color:var(--accent)}
.repo .meta .push{color:var(--ink)}
.lang{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
.zb.hidden{display:none}
/* 仓库详情 */
.dhead{display:flex;align-items:baseline;gap:10px;margin-bottom:6px}
.dhead h1{text-transform:none;letter-spacing:.5px}
.tl{list-style:none;padding:0}
.tl li{display:grid;grid-template-columns:34px 1fr auto;gap:12px;padding:14px 0;align-items:start;position:relative;border-bottom:1px solid var(--line)}
.tl li:last-child{border-bottom:none}
.tl .dot{width:34px;height:34px;border:1px solid var(--accent);background:var(--accent-dim);display:flex;align-items:center;justify-content:center;color:var(--accent);border-radius:50%}
.tl .dot svg{width:14px;height:14px}
.tl h4{font:700 12px/1.4 var(--display-cjk);color:var(--ink);margin:0 0 3px}
.tl h4 b{color:var(--accent)}
.tl p{font-size:12px;color:var(--muted);margin:0;line-height:1.5}
.tl time{font:11px/1 var(--mono);color:var(--dim);white-space:nowrap;padding-top:3px}
.commit{font:11px/1.7 var(--mono);color:var(--muted);margin:4px 0 0;padding-left:10px;border-left:1px dashed var(--line-strong)}
.commit b{color:var(--accent);font-weight:600}
.empty{padding:24px;text-align:center;color:var(--dim);font-size:12px;border:1px dashed var(--line-strong);border-radius:var(--radius-s);background:var(--panel-alt)}
`;

/* ============================================================
   工具
   ============================================================ */
async function api<T = any>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const r = await fetch(API_PREFIX + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return (await r.json()) as T;
}

/** 入口守卫：未连接强制跳 #auth；已连接返回 true */
async function guard(): Promise<boolean> {
  try {
    const r = await api<{ connected: boolean }>("/status");
    if (!r.connected) { location.hash = "#" + HASH_AUTH; return false; }
    return true;
  } catch {
    location.hash = "#" + HASH_AUTH;
    return false;
  }
}

function esc(v: string): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>
  )[c] as string);
}

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff) || diff < 0) return "";
  for (const u of REL_UNITS) {
    if (diff < u.step) {
      const n = Math.floor(diff / (u.step === MIN ? SEC : u.step === HOUR ? MIN : u.step === DAY ? HOUR : u.step === MONTH ? DAY : SEC));
      return u.label ? `${n} ${u.label}` : new Date(iso).toISOString().slice(0, 10);
    }
  }
  return new Date(iso).toISOString().slice(0, 10);
}

function classify(type: string): string {
  return EVENT_CLASSIFY[type] ?? "other";
}

function oneLine(e: any): string {
  try {
    const p: any = e.payload ?? {};
    switch (e.type) {
      case "PushEvent": {
        // events API 的 PushEvent 已无 commits 详情，改为显示分支名（真实提交列表见详情「最近提交」区块）
        const branch = String(p.ref ?? "").replace(/^refs\/heads\//, "");
        return `${TEXT.event.pushBranch}${branch || TEXT.event.push.trim()}`;
      }
      case "PullRequestEvent": return `${TEXT.event.pr}${p.action}${TEXT.event.by}${p.pull_request?.title ?? ""}`;
      case "IssuesEvent": return `${TEXT.event.issue}${p.action}${TEXT.event.by}${p.issue?.title ?? ""}`;
      case "ReleaseEvent": return `${TEXT.event.release}${p.release?.tag_name ?? ""}`;
      case "WatchEvent": return TEXT.event.watch;
      case "ForkEvent": return `${TEXT.event.fork}${p.forkee?.full_name ?? "?"}`;
      case "CreateEvent": return `${TEXT.event.create}${p.ref_type}${p.ref ? TEXT.event.by + p.ref : ""}`;
      case "StarEvent": return TEXT.event.star;
      default: return e.type;
    }
  } catch {
    return e.type ?? "";
  }
}

/* ============================================================
   面板头像（登录后各面板 h1 右侧；含账号详情 / 设置弹层 / 退出）
   ============================================================ */
export class GithubAvatar extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    void this.render();
    // 点外部关闭下拉
    document.addEventListener("click", this.onDocClick);
  }
  disconnectedCallback(): void {
    document.removeEventListener("click", this.onDocClick);
  }
  private onDocClick = (): void => {
    const w = this.shadowRoot?.querySelector(".avatar-wrap");
    w?.classList.remove("open");
  };
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style>
      <div class="avatar-wrap">
        <button class="avatar-btn" title="${esc(TEXT.avatar.title)}"><span class="ch">…</span><span class="dot"></span></button>
        <div class="avatar-menu">
          <div class="am-user"><div class="am-name am-name-v">… <span></span></div><div class="am-src am-src-v"></div></div>
          <button class="am-item" data-act="settings">${esc(TEXT.avatar.settings)}</button>
          <button class="am-item am-danger" data-act="logout">${esc(TEXT.avatar.logout)}</button>
        </div>
      </div>`;
    const wrap = s.querySelector(".avatar-wrap")!;
    s.querySelector(".avatar-btn")!.addEventListener("click", (ev) => {
      ev.stopPropagation();
      wrap.classList.toggle("open");
      void this.loadMe();
    });
    s.querySelector('[data-act="settings"]')!.addEventListener("click", () => {
      wrap.classList.remove("open");
      void this.openSettings();
    });
    s.querySelector('[data-act="logout"]')!.addEventListener("click", () => {
      wrap.classList.remove("open");
      void this.logout();
    });
    void this.loadMe();
  }
  private async loadMe(): Promise<void> {
    const s = this.shadowRoot!;
    try {
      const r = await api<{ connected: boolean; username?: string; source?: string; me?: { name?: string; login?: string } }>("/status");
      if (!r.connected) return;
      const u = r.username ?? r.me?.login ?? "";
      s.querySelector(".ch")!.textContent = (u.slice(0, 1) || "?").toUpperCase();
      const nm = s.querySelector(".am-name-v")!;
      nm.textContent = r.me?.name ?? u;
      nm.querySelector("span")!.textContent = " @" + u;
      s.querySelector(".am-src-v")!.textContent = TEXT.avatar.src + (r.source ?? "?");
    } catch { /* noop */ }
  }
  private async logout(): Promise<void> {
    try { await api("/logout", "POST"); } catch { /* noop */ }
    location.hash = "#" + HASH_AUTH;
    location.reload();
  }
  private async openSettings(): Promise<void> {
    const s = this.shadowRoot!;
    // 打开即拉当前生效阈值预填（settings>vibepm.json>默认 三级，与判定同源）；失败回落前端默认
    let cur: { activeWindowDays?: number; activeMinCommits?: number; activeRecentDays?: number } = {};
    try { cur = await api(R_SUB_THRESHOLDS); } catch { /* 回落默认 */ }
    const win = cur.activeWindowDays ?? ACTIVE_WINDOW_DAYS;
    const min = cur.activeMinCommits ?? ACTIVE_MIN_COMMITS;
    const recent = cur.activeRecentDays ?? ACTIVE_RECENT_DAYS;
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = `<div class="modal">
        <h3>${esc(TEXT.settings.title)}</h3>
        <p class="desc">${esc(TEXT.settings.desc)}</p>
        <div class="row">
          <div class="field"><label>${esc(TEXT.settings.winLabel)}</label><input type="number" data-k="win" /></div>
          <div class="field"><label>${esc(TEXT.settings.minLabel)}</label><input type="number" data-k="min" /></div>
        </div>
        <div class="field"><label>${esc(TEXT.settings.recentLabel)}</label><input type="number" data-k="recent" /></div>
        <div class="btnrow"><button class="primary" data-act="save">${esc(TEXT.settings.save)}</button><span class="msg"></span></div>
        <div class="btnrow" style="justify-content:flex-end"><button class="ghost" data-act="close">${esc(TEXT.settings.close)}</button></div>
      </div>`;
    s.appendChild(mask);
    // 预填当前生效值
    (mask.querySelector('[data-k="win"]') as HTMLInputElement).value = String(win);
    (mask.querySelector('[data-k="min"]') as HTMLInputElement).value = String(min);
    (mask.querySelector('[data-k="recent"]') as HTMLInputElement).value = String(recent);
    requestAnimationFrame(() => mask.classList.add("open"));
    const msg = mask.querySelector(".msg")!;
    mask.querySelector('[data-act="close"]')!.addEventListener("click", () => {
      mask.classList.remove("open");
      setTimeout(() => mask.remove(), 160);
    });
    mask.addEventListener("click", (ev) => {
      if (ev.target === mask) { mask.classList.remove("open"); setTimeout(() => mask.remove(), 160); }
    });
    mask.querySelector('[data-act="save"]')!.addEventListener("click", () => void this.saveSettings(mask, msg));
  }
  private async saveSettings(mask: Element, msg: Element): Promise<void> {
    const s = this.shadowRoot!;
    const win = Number((mask.querySelector('[data-k="win"]') as HTMLInputElement).value);
    const min = Number((mask.querySelector('[data-k="min"]') as HTMLInputElement).value);
    const recent = Number((mask.querySelector('[data-k="recent"]') as HTMLInputElement).value);
    if (!Number.isFinite(win) || !Number.isFinite(min) || !Number.isFinite(recent) || win <= 0 || min <= 0 || recent <= 0) {
      msg.className = "msg err"; msg.textContent = TEXT.settings.invalid; return;
    }
    msg.className = "msg ok"; msg.textContent = TEXT.settings.saved;
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: { [K_ACTIVE_WINDOW_DAYS]: win, [K_ACTIVE_MIN_COMMITS]: min, [K_ACTIVE_RECENT_DAYS]: recent } }),
      });
      // 通知仓库列表强刷（绕过聚合缓存）
      window.dispatchEvent(new CustomEvent(EVT_THRESHOLDS));
      mask.classList.remove("open");
      setTimeout(() => mask.remove(), 160);
    } catch (e) {
      msg.className = "msg err"; msg.textContent = (e as Error).message;
    }
  }
}

/* ============================================================
   认证面板（#auth，仅未登录存在；登录后 AuthPanel 自跳 #repos）
   ============================================================ */
export class GithubAuthPanel extends HTMLElement {
  private timer: number | undefined;
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    void this.render();
  }
  disconnectedCallback(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
  }
  private setMsg(text: string, kind: "ok" | "err" = "ok"): void {
    const el = this.shadowRoot!.getElementById("msg")!;
    el.className = "msg " + kind;
    el.textContent = text;
  }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style>
      <h1>${esc(TEXT.auth.title)}</h1>
      <p class="desc">${esc(TEXT.auth.desc)}</p>
      <div><span class="status" id="st">${esc(TEXT.auth.statusReading)}</span></div>
      <div class="form">
        <h3 class="h-sec">${esc(TEXT.auth.deviceTitle)}</h3>
        <p class="desc" style="margin-bottom:12px">${esc(TEXT.auth.deviceDesc)}</p>
        <div class="btnrow">
          <button class="primary" id="btnDevice">${esc(TEXT.auth.deviceBtn)}</button>
          <code class="big" id="dCode"></code>
          <a class="link" id="dVuri" target="_blank" rel="noreferrer noopener" style="display:none">${esc(TEXT.auth.deviceOpen)}</a>
        </div>
        <h3 class="h-sec" style="margin-top:16px">${esc(TEXT.auth.patTitle)}</h3>
        <div id="patBox">
          <label>${esc(TEXT.auth.patUsername)}</label>
          <input id="u" type="text" autocomplete="username" spellcheck="false" />
          <label style="margin-top:10px">${esc(TEXT.auth.patToken)}</label>
          <input id="t" type="password" autocomplete="new-password" spellcheck="false" />
          <div class="btnrow"><button class="primary" id="btnLogin">${esc(TEXT.auth.patBtn)}</button><span class="msg" id="msg"></span></div>
        </div>
        <div class="btnrow"><button class="ghost" id="btnPat">${esc(TEXT.auth.patToggle)}</button></div>
      </div>`;
    s.getElementById("btnLogin")!.addEventListener("click", () => void this.login());
    s.getElementById("btnDevice")!.addEventListener("click", () => void this.deviceStart());
    s.getElementById("btnPat")!.addEventListener("click", () => {
      s.getElementById("patBox")!.classList.toggle("hidden");
    });
    await this.refresh();
  }
  private async refresh(): Promise<void> {
    const s = this.shadowRoot!;
    const st = s.getElementById("st")!;
    st.className = "status"; st.textContent = TEXT.auth.statusReading;
    try {
      const r = await api<{ connected: boolean; source?: string; username?: string }>("/status");
      if (r.connected) {
        // 登录时 #auth 页面不存在 → 强制回 #repos
        location.hash = "#" + HASH_REPOS;
        return;
      }
      st.textContent = TEXT.auth.statusOff;
      st.className = "status off";
    } catch {
      st.textContent = TEXT.auth.statusFail;
    }
  }
  private async login(): Promise<void> {
    const s = this.shadowRoot!;
    const u = (s.getElementById("u") as HTMLInputElement).value.trim();
    const t = (s.getElementById("t") as HTMLInputElement).value.trim();
    if (!u || !t) { this.setMsg(TEXT.auth.patNeedBoth, "err"); return; }
    this.setMsg(TEXT.auth.patConnecting, "ok");
    const r = await api<{ ok: boolean; reason?: string }>("/login", "POST", { username: u, token: t });
    if (r.ok) {
      this.setMsg(TEXT.auth.patOk, "ok");
      (s.getElementById("t") as HTMLInputElement).value = "";
      await this.refresh();
    } else {
      this.setMsg(r.reason ?? TEXT.auth.patFail, "err");
    }
  }
  private async deviceStart(): Promise<void> {
    const s = this.shadowRoot!;
    const r = await api<{ ok: boolean; reason?: string; user_code?: string; verification_uri?: string; interval?: number }>("/device/start", "POST");
    if (!r.ok) { this.setMsg(r.reason ?? TEXT.auth.deviceStartFail, "err"); return; }
    s.getElementById("dCode")!.textContent = r.user_code ?? "";
    const a = s.getElementById("dVuri") as HTMLAnchorElement;
    a.href = r.verification_uri ?? "";
    a.style.display = "inline";
    this.setMsg(TEXT.auth.deviceWait, "ok");
    const iv = ((r.interval ?? DEVICE_POLL_INTERVAL_S) * 1000);
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.devicePoll(), iv);
  }
  private async devicePoll(): Promise<void> {
    const r = await api<{ ok: boolean; status?: string }>("/device/poll", "POST");
    if (r.ok) {
      if (this.timer !== undefined) window.clearInterval(this.timer);
      this.setMsg(TEXT.auth.deviceOk, "ok");
      await this.refresh();
    } else if (r.status === "expired" || r.status === "denied") {
      if (this.timer !== undefined) window.clearInterval(this.timer);
      this.setMsg(r.status === "denied" ? TEXT.auth.deviceDenied : TEXT.auth.deviceExpired, "err");
    }
  }
}

/* ============================================================
   仓库列表面板（#repos；h1 右侧挂头像）
   ============================================================ */
export class GithubReposPanel extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    void this.render();
    window.addEventListener(EVT_THRESHOLDS, this.onThresholds);
  }
  disconnectedCallback(): void {
    window.removeEventListener(EVT_THRESHOLDS, this.onThresholds);
  }
  private onThresholds = (): void => void this.render(true);

  private async render(force = false): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style><div class="ptitle"><h1>${esc(TEXT.repos.title)}</h1><${PANEL_KIND_AVATAR}></${PANEL_KIND_AVATAR}></div><p class="desc">${esc(TEXT.repos.loading)}</p>`;
    if (!(await guard()).valueOf()) return;
    const r = await api<{
      repos?: any[]; activeCount?: number; dustyCount?: number;
      activeWindowDays?: number; activeMinCommits?: number; activeRecentDays?: number; statsWindowDays?: number;
    }>("/repos" + (force ? "?refresh=1" : ""));
    const repos = r.repos ?? [];
    const active = repos.filter((x) => x.active);
    const dusty = repos.filter((x) => !x.active);
    const win = r.activeWindowDays ?? ACTIVE_WINDOW_DAYS;
    const min = r.activeMinCommits ?? ACTIVE_MIN_COMMITS;
    const recent = r.activeRecentDays ?? ACTIVE_RECENT_DAYS;
    s.innerHTML = `<style>${CSS}</style>
      <div class="ptitle"><h1>${esc(TEXT.repos.title)}</h1><${PANEL_KIND_AVATAR}></${PANEL_KIND_AVATAR}></div>
      <p class="desc">${esc(TEXT.repos.descActiveNote.replace("{window}", String(win)).replace("{min}", String(min)).replace("{recent}", String(recent)))}</p>
      <div class="statline">
        <span>${esc(TEXT.repos.total)}<b>${repos.length}</b></span>
        <span>${esc(TEXT.repos.sep)}${esc(TEXT.repos.activeCount)}<b>${active.length}</b></span>
        <span>${esc(TEXT.repos.sep)}${esc(TEXT.repos.dustyCount)}<b>${dusty.length}</b></span>
        <span style="margin-left:auto"><button class="primary" data-act="reload">${esc(TEXT.repos.reload)}</button></span>
      </div>
      <div id="list"></div>`;
    s.querySelector('[data-act="reload"]')!.addEventListener("click", () => void this.render(true));
    const list = s.getElementById("list")!;
    const html: string[] = [];
    html.push(zhead(TEXT.repos.sectionActive, active.length, true));
    for (const x of active) html.push(this.row(x, win));
    html.push(zhead(TEXT.repos.sectionDusty, dusty.length, false));
    for (const x of dusty) html.push(this.row(x, win));
    list.innerHTML = html.join("");
    list.querySelectorAll<HTMLElement>(".zhead").forEach((z) => {
      z.addEventListener("click", () => {
        const b = z.nextElementSibling as HTMLElement;
        b.classList.toggle("hidden");
        z.classList.toggle("open", !b.classList.contains("hidden"));
      });
    });
    list.querySelectorAll<HTMLElement>(".repo").forEach((row) => {
      row.addEventListener("click", () => {
        const name = row.getAttribute("data-name") ?? "";
        if (name) location.hash = "#" + HASH_REPO + "?name=" + encodeURIComponent(name);
      });
    });
  }
  private row(x: any, win: number): string {
    const lang = x.language
      ? `<span class="lang" style="background:${LANG_COLORS[x.language] ?? LANG_COLOR_FALLBACK}"></span>${esc(x.language)}`
      : "";
    const desc = x.description ? `<div class="ds">${esc(x.description)}</div>` : "";
    const tag = (x.archived ? esc(TEXT.repos.archived) : "") + (x.private ? esc(TEXT.repos.private) : "");
    const lastPush = x.lastPushAt ? esc(TEXT.repos.lastPush) + esc(relTime(x.lastPushAt)) : "";
    // 空仓库：显示「空仓库」而非裸 0 提交
    const stats = x.empty
      ? esc(TEXT.repos.emptyRepo)
      : `${esc(TEXT.repos.commits)}<b>${x.commits30d ?? 0}</b>${esc(TEXT.repos.perDays)}${win}d<br />${lastPush}`;
    return `<div class="repo" data-name="${esc(x.full_name)}">
      <div><div class="nm">${esc(x.name)}${tag}</div>${desc}</div>
      <div class="meta">${lang}</div>
      <div class="meta">${esc(TEXT.repos.star)}<span class="acc">${x.stargazers_count ?? 0}</span> ${esc(TEXT.repos.fork)}<span class="acc">${x.forks_count ?? 0}</span><br />${stats}</div>
    </div>`;
  }
}

function zhead(title: string, cnt: number, open: boolean): string {
  return `<div class="zhead ${open ? "open" : ""}"><h2>${esc(title)}</h2><span class="cnt">${cnt}</span><span class="caret">▶</span></div><div class="zb ${open ? "" : "hidden"}"></div>`;
}

/* ============================================================
   仓库详情面板（#repo?name=owner/repo；h1 右侧挂头像）
   ============================================================ */
export class GithubRepoDetailPanel extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    void this.render();
  }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    const name = new URLSearchParams(location.hash.split("?")[1] ?? "").get("name") ?? "";
    s.innerHTML = `<style>${CSS}</style><div class="ptitle"><h1>${esc(TEXT.detail.title)}</h1><${PANEL_KIND_AVATAR}></${PANEL_KIND_AVATAR}></div><p class="desc">${esc(TEXT.repos.loading)}</p>`;
    if (!(await guard()).valueOf()) return;
    if (!name) {
      s.innerHTML = `<style>${CSS}</style><div class="empty">${esc(TEXT.detail.emptyName)}</div>`;
      return;
    }
    const [owner, repo] = name.split("/");
    const data = await api<{ items?: any[]; statsWindowDays?: number; commits?: number; recent?: Array<{ sha: string; message: string; date: string }>; empty?: boolean }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/events`);
    const items = data.items ?? [];
    const win = data.statsWindowDays ?? ACTIVE_WINDOW_DAYS;
    const commits = data.commits ?? 0; // 后端 commits API 统计（events 的 PushEvent 已无 commits 详情）
    const recent = data.recent ?? [];
    // 最近提交区块：events 的 PushEvent 无 commits 详情，真实 commit 列表由后端 commits API 下发
    const recentHtml = recent.length
      ? `<div class="zhead open"><h2>${esc(TEXT.detail.recentTitle)}</h2></div><div class="zb">${recent.map((c) =>
          `<p class="commit"><b>${esc(String(c.sha ?? "").slice(0, SHORT_SHA_LEN))}</b> ${esc(c.message ?? "")}</p>`).join("")}</div>`
      : "";
    s.innerHTML = `<style>${CSS}</style>
      <div class="ptitle">
        <div class="dhead"><h1>${esc(name)}</h1><a class="link" href="https://github.com/${esc(name)}" target="_blank" rel="noreferrer noopener">${esc(TEXT.detail.openGithub)}</a></div>
        <${PANEL_KIND_AVATAR}></${PANEL_KIND_AVATAR}>
      </div>
      <p class="desc">${esc(TEXT.detail.commits.replace("{window}", String(win)))}<b style="color:var(--accent)">${commits}</b>${esc(TEXT.detail.commitsTimes)}${esc(TEXT.detail.sep)}${esc(TEXT.detail.events)}${items.length}${esc(TEXT.detail.eventsCount)}${data.empty ? esc(TEXT.detail.sep) + esc(TEXT.repos.emptyRepo) : ""}</p>
      ${recentHtml}
      <ul class="tl" id="tl"></ul>`;
    const ul = s.getElementById("tl")!;
    if (!items.length) {
      ul.innerHTML = `<li><div class="empty">${esc(TEXT.detail.emptyEvents)}</div></li>`;
      return;
    }
    ul.innerHTML = items.map((e) => {
      const t = classify(e.type);
      const icon = ICONS[t] ?? ICONS.other;
      // 注：events 的 PushEvent 已无 commits 详情，commit 列表统一在「最近提交」区块（recentHtml）展示
      return `<li>
        <div class="dot"><svg viewBox="0 0 24 24" fill="currentColor">${icon}</svg></div>
        <div><h4><b>${esc(e.actor?.login ?? "?")}</b>${esc(TEXT.event.by)}${esc(oneLine(e))}</h4></div>
        <time>${esc(relTime(e.created_at ?? ""))}</time>
      </li>`;
    }).join("");
  }
}
