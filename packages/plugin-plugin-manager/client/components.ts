/**
 * <plugin-manager-panel>：设置里的「插件开关」列表（对齐 dsh ui-settings-plugin-inventory）。
 * 每行 = 插件名 + 描述 + 开关；内核三件套 locked（禁改）。开关写 settings，冷启动生效。
 */
const CSS = /* css */`
:host{display:block}
h1{font-size:14px;letter-spacing:1.5px;color:#d6dbe1;margin:0 0 6px 0;font-weight:700;text-transform:uppercase}
.desc{font-size:12px;color:#7a828c;margin-bottom:18px;line-height:1.6}
.tip{border:1px dashed #262c33;background:#161a1e;padding:10px 12px;border-radius:4px;font-size:11px;color:#7a828c;margin-bottom:16px;line-height:1.6}
.list{border:1px solid #262c33;background:#161a1e;border-radius:4px;overflow:hidden}
.row{display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid #262c33}
.row:last-child{border-bottom:none}
.row .info{flex:1;min-width:0}
.row .nm{font-size:12px;color:#d6dbe1;font-weight:600;display:flex;align-items:center;gap:8px}
.row .nm code{font-family:"JetBrains Mono",Consolas,monospace;font-size:10px;color:#7a828c;letter-spacing:.3px}
.row .ds{font-size:11px;color:#7a828c;margin-top:3px;line-height:1.5}
.badge{display:inline-block;padding:1px 6px;font-size:9px;letter-spacing:1px;text-transform:uppercase;border:1px solid #262c33;border-radius:2px;color:#7a828c}
.badge.locked{border-color:#2f8566;color:#2ba77d;background:#16392e}
.empty{padding:18px;color:#7a828c;font-size:12px;text-align:center}
.status{font-size:11px;margin-top:10px;min-height:14px}
.status.ok{color:#2ba77d}.status.err{color:#b24a4a}
/* switch */
.sw{position:relative;width:34px;height:18px;flex-shrink:0;border-radius:999px;background:#2a3038;border:1px solid #333b45;cursor:pointer;transition:background .15s}
.sw.on{background:#1f6f52;border-color:#2f8566}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#d6dbe1;transition:transform .15s}
.sw.on::after{transform:translateX(16px);background:#fff}
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