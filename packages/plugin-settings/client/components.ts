/**
 * settings-panel：显示所有 settings key/value，并提供最小的新建 / 修改 / 删除。
 * - 极简：一张 table + 一行表单；无 fancy 校验；value 直接接受 JSON 字面量（也接受字符串）。
 */

const CSS = /* css */`
:host{display:block}
h1{font-size:14px;letter-spacing:1.5px;color:#d6dbe1;margin:0 0 6px 0;font-weight:700;text-transform:uppercase}
.desc{font-size:12px;color:#7a828c;margin-bottom:18px}
.kv{border:1px solid #262c33;background:#161a1e;border-radius:4px;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #262c33;vertical-align:top}
th{background:#1b2025;color:#7a828c;font-weight:500;letter-spacing:.8px;text-transform:uppercase;font-size:10px}
tr:last-child td{border-bottom:none}
.k{font-family:"JetBrains Mono",Consolas,monospace;color:#d6dbe1}
.v{font-family:"JetBrains Mono",Consolas,monospace;color:#2ba77d;white-space:pre-wrap;word-break:break-word;max-width:520px;display:inline-block}
.tool{display:flex;gap:6px}
button{border:1px solid #262c33;background:#1b2025;color:#d6dbe1;padding:3px 8px;border-radius:2px;cursor:pointer;font-size:11px;letter-spacing:.5px}
button:hover{border-color:#2f8566;color:#2ba77d}
button.primary{background:#16392e;border-color:#2f8566;color:#2ba77d}
.form{margin-top:18px;border:1px dashed #262c33;padding:12px;border-radius:4px;background:#161a1e}
.form h3{font-size:11px;color:#7a828c;letter-spacing:1.2px;text-transform:uppercase;margin:0 0 10px 0;font-weight:600}
.row{display:grid;grid-template-columns:160px 1fr auto;gap:8px;align-items:start}
input[type=text],textarea{background:#0f1215;border:1px solid #262c33;color:#d6dbe1;font-family:"JetBrains Mono",Consolas,monospace;font-size:11px;padding:6px 8px;border-radius:2px;resize:vertical}
textarea{min-height:64px}
.status{font-size:11px;margin-top:8px;min-height:14px}
.status.ok{color:#2ba77d}
.status.err{color:#b24a4a}
.empty{padding:18px;color:#7a828c;font-size:12px;text-align:center}
`;

export class SettingsPanel extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    void this.render();
  }
  private async api(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<any> {
    const resp = await fetch("/api/settings" + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return await resp.json();
  }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style>
      <h1>Settings</h1>
      <p class="desc">显示 <code>settings</code> 表所有键值。Value 支持 JSON（字符串也 OK）。</p>
      <div class="kv"><table id="tbl"><thead><tr><th style="width:160px">Key</th><th>Value</th><th style="width:72px"></th></tr></thead><tbody id="tb"></tbody></table></div>
      <div class="status" id="st"></div>
      <div class="form">
        <h3>新增 / 修改</h3>
        <div class="row">
          <input id="k" type="text" placeholder="settings key" spellcheck="false" />
          <textarea id="v" placeholder='value (JSON 或字符串)："foo" / true / [1,2,3] / {"n":1}'></textarea>
          <button class="primary" id="save">保存</button>
        </div>
      </div>`;
    await this.refresh();
    s.getElementById("save")!.addEventListener("click", () => void this.save());
  }
  private setStatus(text: string, kind: "ok" | "err" = "ok"): void {
    const el = this.shadowRoot!.getElementById("st")!;
    el.className = "status " + kind;
    el.textContent = text;
  }
  private async refresh(): Promise<void> {
    const data = await this.api("GET", "");
    const tb = this.shadowRoot!.getElementById("tb")!;
    const map = data?.data ?? {};
    const keys = Object.keys(map);
    if (!keys.length) {
      tb.innerHTML = `<tr><td colspan="3" class="empty">（暂无配置；连接 GitHub 之后会自动写入 github.* 等键）</td></tr>`;
      return;
    }
    tb.innerHTML = keys.sort().map((k) => {
      const v = (JSON.stringify(map[k]) ?? "null");
      return `<tr>
        <td><span class="k"></span></td>
        <td><span class="v"></span></td>
        <td><div class="tool"><button data-act="del">删除</button></div></td>
      </tr>`;
    }).join("");
    // 把内容安全地塞进去（避免 value 里的 <script> 等；简单做法：set node text）
    const rows = tb.querySelectorAll("tr");
    keys.sort().forEach((k, i) => {
      const r = rows[i];
      const sp = r.querySelectorAll<HTMLSpanElement>("span");
      sp[0].textContent = k;
      sp[1].textContent = JSON.stringify(map[k], null, 2);
      const btn = r.querySelector<HTMLButtonElement>("button[data-act=del]")!;
      btn.addEventListener("click", () => void this.deleteKey(k));
    });
  }
  private async save(): Promise<void> {
    const k = (this.shadowRoot!.getElementById("k") as HTMLInputElement).value.trim();
    const vRaw = (this.shadowRoot!.getElementById("v") as HTMLTextAreaElement).value;
    if (!k) { this.setStatus("请填 Key", "err"); return; }
    let parsed: unknown;
    try { parsed = vRaw === "" ? "" : JSON.parse(vRaw); }
    catch { parsed = vRaw; } // 解析失败就当 plain string
    const r = await this.api("POST", "", { key: k, value: parsed });
    if (r?.ok) { this.setStatus(`已保存 ${k}`); await this.refresh(); }
    else this.setStatus(r?.reason ?? "保存失败", "err");
  }
  private async deleteKey(k: string): Promise<void> {
    const r = await this.api("DELETE", "/" + encodeURIComponent(k));
    if (r?.ok) { this.setStatus(`已删除 ${k}`); await this.refresh(); }
    else this.setStatus("删除失败", "err");
  }
}
