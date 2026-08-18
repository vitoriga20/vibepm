/**
 * <feed-panel>：仓库动态 timeline。
 * - 拿 /api/feed 渲染；无 token 时引导跳 #auth。
 */

const CSS = /* css */`
:host{display:block}
h1{font-size:16px;letter-spacing:1.5px;color:#f6f7f3;margin:0 0 6px 0;font-weight:900;text-transform:uppercase;font-family:var(--display-cjk, sans-serif)}
.head{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-left:12px;border-left:1px solid var(--yellow,#fff44f)}
.desc{font-size:12px;color:#9aa0a7;margin:0;flex:1}
button{border:1px solid #5f656b;border-left:3px solid #899096;background:#303438;color:#f6f7f3;
  padding:6px 14px;border-radius:0;cursor:pointer;font:700 11px/1 var(--display-cjk, sans-serif);letter-spacing:.5px;box-shadow:2px 3px 0 #050607;transition:color .18s,box-shadow .18s}
button:hover{border-color:var(--yellow,#fff44f);color:var(--yellow,#fff44f);box-shadow:3px 4px 0 #050607}
button.primary{border-color:#4d5257;border-left-color:var(--yellow,#fff44f)}
.tl{list-style:none;padding:0;margin:0;border-top:1px solid #3c4147}
.tl li{display:grid;grid-template-columns:34px 1fr auto;gap:12px;padding:13px 0;align-items:start;position:relative}
.tl li+li::before{content:"";position:absolute;left:17px;top:0;bottom:0;width:1px;background:#3c4147}
.dot{width:34px;height:34px;border:1px solid var(--yellow,#fff44f);background:#0d0f11;
  display:flex;align-items:center;justify-content:center;color:var(--yellow,#fff44f);box-shadow:2px 2px 0 rgba(255,244,79,.28)}
.dot svg{width:14px;height:14px}
.tl h4{font-size:12px;color:#f6f7f3;letter-spacing:.3px;margin:0 0 4px 0;font-weight:700;line-height:1.4;font-family:var(--display-cjk, sans-serif)}
.tl h4 b{color:var(--yellow,#fff44f);font-weight:700}
.tl p{font-size:12px;color:#9aa0a7;margin:0;line-height:1.5}
.tl p a{color:#9aa0a7;text-decoration:none;border-bottom:1px dashed #3c4147}
.tl p a:hover{color:var(--yellow,#fff44f);border-color:var(--yellow,#fff44f)}
.tl time{font-size:11px;color:#9aa0a7;letter-spacing:.5px;white-space:nowrap;margin-top:2px;font-family:var(--mono, monospace)}
.empty{padding:26px;text-align:center;color:#9aa0a7;font-size:12px;border:1px dashed #3c4147;background:#16191c}
.empty a{color:var(--yellow,#fff44f)}
.msg{font-size:11px;margin-left:4px}
.msg.ok{color:var(--yellow,#fff44f)}.msg.err{color:#ff9c98}
`;

const ICONS: Record<string, string> = {
  push: `<path d="M3 12 h10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M11 7 l5 5 l-5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  pr: `<path d="M6 3 a2 2 0 1 0 0 4 2 2 0 0 0 0 -4 z"/><circle cx="18" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 7 v10 M10 10 h4 a4 4 0 0 1 4 4 v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  issue: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5 v5.5 M12 16.2 v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  release: `<path d="M12 3 v4 M12 17 v4 M5 9 l-3.5 -2 M22 9 l-3.5 -2 M5 15 l-3.5 2 M22 15 l-3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  star: `<path d="M12 3.5 l2.7 5.6 6.1.9 -4.4 4.3 1 6 -5.4 -2.9 -5.4 2.9 1 -6 -4.4 -4.3 6.1 -.9 z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`,
  fork: `<circle cx="6" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 7 v2 a2 2 0 0 0 2 2 h8 a2 2 0 0 0 2 -2 V7 M12 11 v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  create: `<path d="M12 3 v18 M3 12 h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  watch: `<circle cx="12" cy="12" r="2.2" fill="currentColor" opacity=".9"/><path d="M3 12 s3.5 -7 9 -7 9 7 9 7 -3.5 7 -9 7 -9 -7 -9 -7 z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  other: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
};

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(diff) || diff < 0) return "";
  const f = (n: number, u: string) => `${Math.floor(n)} ${u}前`;
  if (diff < 60) return f(diff, "秒");
  if (diff < 3600) return f(diff / 60, "分");
  if (diff < 86400) return f(diff / 3600, "小时");
  if (diff < 86400 * 30) return f(diff / 86400, "天");
  return new Date(iso).toISOString().slice(0, 10);
}

export class FeedPanel extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    void this.render();
  }
  private async api(): Promise<any> {
    const r = await fetch("/api/feed", { method: "GET" });
    return await r.json();
  }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style>
      <h1>仓库动态</h1>
      <div class="head">
        <p class="desc" id="desc">正在加载…</p>
        <button id="reload" class="primary">刷新</button>
        <span class="msg" id="msg"></span>
      </div>
      <ul class="tl" id="tl"></ul>`;
    s.getElementById("reload")!.addEventListener("click", () => void this.load());
    await this.load();
  }
  private setMsg(t: string, kind: "ok" | "err" = "ok"): void {
    const el = this.shadowRoot!.getElementById("msg")!;
    el.className = "msg " + kind; el.textContent = t;
  }
  private async load(): Promise<void> {
    const ul = this.shadowRoot!.getElementById("tl")!;
    const desc = this.shadowRoot!.getElementById("desc")!;
    desc.textContent = "加载中…";
    this.setMsg("");
    try {
      const r = await this.api();
      if (!r?.connected) {
        ul.innerHTML = `<div class="empty">还没连接 GitHub。<a href="#auth">去连接 →</a></div>`;
        desc.textContent = "需先在 #auth 填入 token 之后才能看动态。";
        return;
      }
      const items: any[] = r?.items ?? [];
      if (!items.length) {
        ul.innerHTML = `<div class="empty">（最近没动态，或者你关注的仓库太安静）</div>`;
      } else {
        ul.innerHTML = items.map((it) => {
          const svg = ICONS[it.icon] ?? ICONS.other;
          return `<li>
            <div class="dot"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${svg}</svg></div>
            <div>
              <h4><b>${it.actor}</b> · ${it.title}</h4>
              <p>仓库：<a href="${it.repo_url}" target="_blank" rel="noreferrer noopener">${it.repo}</a></p>
            </div>
            <time datetime="${it.created_at}">${relTime(it.created_at)}</time>
          </li>`;
        }).join("");
      }
      desc.textContent = `共 ${items.length} 条（默认 received_events 前 30 条）`;
      this.setMsg("已更新", "ok");
    } catch (e) {
      desc.textContent = "加载失败";
      this.setMsg((e as Error).message, "err");
    }
  }
}
