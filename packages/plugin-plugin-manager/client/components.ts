/**
 * <plugin-manager-panel>：设置里的「插件开关」列表（对齐 dsh ui-settings-plugin-inventory）。
 * 每行 = 插件名 + 描述 + 开关；内核三件套 locked（禁改）。开关写 settings，冷启动生效。
 */
const CSS = /* css */`
:host{display:block}
h1{font-size:16px;letter-spacing:1.5px;color:#f6f7f3;margin:0 0 6px 0;font-weight:900;text-transform:uppercase;font-family:var(--display-cjk, sans-serif)}
.desc{font-size:12px;color:#9aa0a7;margin-bottom:18px;line-height:1.6}
.tip{border:1px dashed #3c4147;border-left:3px solid var(--yellow,#fff44f);background:#16191c;padding:10px 12px;font-size:11px;color:#9aa0a7;margin-bottom:16px;line-height:1.6}
.list{border:1px solid #3a4046;background:#16191c;overflow:hidden;box-shadow:4px 4px 0 rgba(0,0,0,.4)}
.row{display:flex;align-items:center;gap:14px;padding:13px 16px;border-bottom:1px solid #2a2f34}
.row:last-child{border-bottom:none}
.row:hover{background:#1d2126}
.row .info{flex:1;min-width:0}
.row .nm{font-size:13px;color:#f6f7f3;font-weight:700;display:flex;align-items:center;gap:8px;font-family:var(--display-cjk, sans-serif)}
.row .nm code{font-family:var(--mono, monospace);font-size:10px;color:#9aa0a7;letter-spacing:.3px}
.row .ds{font-size:11px;color:#9aa0a7;margin-top:3px;line-height:1.5}
.badge{display:inline-block;padding:2px 7px;font:700 8px/1 var(--mono, monospace);letter-spacing:1px;text-transform:uppercase;border:1px solid #5f656b;color:#9aa0a7}
.badge.locked{color:#111;border-color:var(--yellow,#fff44f);background:var(--yellow,#fff44f)}
.empty{padding:18px;color:#9aa0a7;font-size:12px;text-align:center}
.status{font-size:11px;margin-top:10px;min-height:14px}
.status.ok{color:var(--yellow,#fff44f)}.status.err{color:#ff9c98}
/* switch */
.sw{position:relative;width:36px;height:20px;flex-shrink:0;border:1px solid #3c4147;background:#20242a;cursor:pointer;transition:background .15s;box-shadow:2px 2px 0 #050607}
.sw.on{background:var(--yellow,#fff44f);border-color:var(--yellow,#fff44f)}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;background:#9aa0a7;transition:transform .15s,background .15s}
.sw.on::after{transform:translateX(16px);background:#0a0b0d}
.sw.locked{cursor:not-allowed;opacity:.5}
`;
export class PluginManagerPanel extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    void this.render();
  }
  private async api(m: "GET" | "POST", path: string, body?: unknown): Promise<any> {
    const r = await fetch("/api/plugins" + path, {
      method: m,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return await r.json();
  }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style>
      <h1>插件</h1>
      <p class="desc">已加载插件一览。开关写进本地 settings，<b>冷启动生效</b>：重启内核后对应插件的界面与后端一起消失/恢复。</p>
      <div class="tip">内核三件套（Storage / Web UI / Shell）承载界面本身，无法关闭。若关闭某个插件导致依赖缺失，受影响的功能会自动隐藏。</div>
      <div class="list" id="list"><div class="empty">加载中…</div></div>
      <div class="status" id="st"></div>`;
    await this.refresh();
  }
  private setStatus(text: string, kind: "ok" | "err" = "ok"): void {
    const el = this.shadowRoot!.getElementById("st")!;
    el.className = "status " + kind; el.textContent = text;
  }
  private async refresh(): Promise<void> {
    const list = this.shadowRoot!.getElementById("list")!;
    let rows;
    try {
      const r = await this.api("GET", "");
      rows = r?.data ?? [];
    } catch {
      list.innerHTML = `<div class="empty">读取失败</div>`;
      return;
    }
    if (!rows.length) { list.innerHTML = `<div class="empty">（暂无可管理插件）</div>`; return; }
    list.innerHTML = rows.map((p: any) => `
      <div class="row" data-name="${p.name}">
        <div class="info">
          <div class="nm">${p.display}<code>${p.name}</code>${p.locked ? `<span class="badge locked">内核</span>` : ""}</div>
          <div class="ds">${p.desc || "—"}</div>
        </div>
        <div class="sw ${p.enabled ? "on" : ""} ${p.locked ? "locked" : ""}" data-action="toggle"></div>
      </div>`).join("");
    list.querySelectorAll<HTMLElement>(".sw").forEach((sw: HTMLElement, i: number) => {
      const p = rows[i];
      if (p.locked) return;
      sw.addEventListener("click", () => void this.toggle(p, sw));
    });
  }
  private async toggle(p: any, sw: HTMLElement): Promise<void> {
    const target = !p.enabled;
    const r = await this.api("POST", "/" + encodeURIComponent(p.name), { enabled: target });
    if (r?.ok) {
      p.enabled = target;
      sw.classList.toggle("on", target);
      this.setStatus(`${target ? "启用" : "已禁用"} ${p.display} → 冷启动生效，重启后应用`);
    } else {
      this.setStatus(r?.reason ?? "操作失败", "err");
    }
  }
}