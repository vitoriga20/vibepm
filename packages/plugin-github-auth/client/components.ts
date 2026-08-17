/**
 * <github-auth-panel>：username + token 表单；显示连接状态、当前账号信息。
 */
const CSS = /* css */`
:host{display:block}
h1{font-size:14px;letter-spacing:1.5px;color:#d6dbe1;margin:0 0 6px 0;font-weight:700;text-transform:uppercase}
.desc{font-size:12px;color:#7a828c;margin-bottom:18px;line-height:1.6}
.status{display:inline-block;padding:3px 8px;font-size:10px;letter-spacing:1px;border:1px solid #262c33;border-radius:2px;
  color:#7a828c;margin-bottom:12px;text-transform:uppercase}
.status.on{border-color:#2f8566;color:#2ba77d;background:#16392e}
.card{border:1px solid #262c33;background:#161a1e;border-radius:4px;padding:14px 16px;margin-bottom:14px}
.me{display:flex;align-items:center;gap:10px}
.av{width:36px;height:36px;border-radius:50%;border:1px solid #262c33;background:#1b2025}
.me .n{font-size:12px;color:#d6dbe1;font-weight:600}
.me .l{font-size:11px;color:#7a828c}
.form{border:1px dashed #262c33;background:#161a1e;padding:14px 16px;border-radius:4px;margin-top:8px}
.form h3{font-size:11px;color:#7a828c;letter-spacing:1.2px;text-transform:uppercase;margin:0 0 10px 0;font-weight:600}
.field{margin-bottom:12px}
label{font-size:11px;color:#7a828c;letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:6px}
input[type=text],input[type=password]{width:100%;background:#0f1215;border:1px solid #262c33;color:#d6dbe1;
  font-family:"JetBrains Mono",Consolas,monospace;font-size:12px;padding:8px 10px;border-radius:2px}
.hint{font-size:11px;color:#7a828c;margin-top:6px;line-height:1.6}
.actions{display:flex;gap:8px;align-items:center;margin-top:4px}
button{border:1px solid #262c33;background:#1b2025;color:#d6dbe1;padding:6px 12px;border-radius:2px;cursor:pointer;font-size:11px;letter-spacing:.5px}
button:hover{border-color:#2f8566;color:#2ba77d}
button.primary{background:#16392e;border-color:#2f8566;color:#2ba77d}
button.ghost{background:transparent}
.msg{font-size:11px;margin-left:4px}
.msg.ok{color:#2ba77d}.msg.err{color:#b24a4a}
`;
export class GithubAuthPanel extends HTMLElement {
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    void this.render();
  }
  private async call(m: "GET" | "POST", p: string, body?: unknown): Promise<any> {
    const r = await fetch("/api/github" + p, {
      method: m, headers: body ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return await r.json();
  }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style>
      <h1>连接 GitHub</h1>
      <p class="desc">MVP 走 Personal Access Token（classic）。只存本地 SQLite；token 不会回传给前端。<br>
        推荐权限：<code>repo</code> + <code>read:user</code> + <code>read:org</code>（最少可只 <code>read:user</code> + <code>public_repo</code>）。</p>
      <div id="stBox"><span class="status" id="st">读取中…</span></div>
      <div id="meBox" class="card hidden">
        <div class="me"><img id="av" class="av" alt="avatar" referrerpolicy="no-referrer"/>
          <div><div class="n" id="mName"></div><div class="l" id="mLogin"></div></div>
          <div style="margin-left:auto"><button id="btnLogout" class="ghost">退出</button></div>
        </div>
      </div>
      <div class="form">
        <h3>账号 / Token</h3>
        <div class="field"><label>GitHub 用户名</label><input id="u" type="text" autocomplete="username" spellcheck="false"/></div>
        <div class="field"><label>Personal Access Token (classic)</label>
          <input id="t" type="password" autocomplete="new-password" spellcheck="false"/>
          <div class="hint">生成：<a href="https://github.com/settings/tokens?type=beta" target="_blank"
            rel="noreferrer noopener">github.com/settings/tokens</a> · 写完点 <b>连接</b>，会调 <code>GET /user</code> 校验。</div>
        </div>
        <div class="actions"><button id="btnLogin" class="primary">连接</button><span class="msg" id="msg"></span></div>
      </div>`;
    s.getElementById("btnLogin")!.addEventListener("click", () => void this.login());
    s.getElementById("btnLogout")!.addEventListener("click", () => void this.logout());
    await this.refresh();
  }
  private setMsg(text: string, kind: "ok" | "err" = "ok"): void {
    const el = this.shadowRoot!.getElementById("msg")!;
    el.className = "msg " + kind; el.textContent = text;
  }
  private async refresh(): Promise<void> {
    const st = this.shadowRoot!.getElementById("st")!;
    st.className = "status"; st.textContent = "读取中…";
    try {
      const r = await this.call("GET", "/status");
      if (r?.connected) {
        st.className = "status on"; st.textContent = "已连接";
        const me = r.me ?? {};
        (this.shadowRoot!.getElementById("meBox") as HTMLElement).classList.remove("hidden");
        const av = this.shadowRoot!.getElementById("av") as HTMLImageElement;
        if (me.avatar_url) av.src = me.avatar_url; else av.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'></svg>";
        this.shadowRoot!.getElementById("mName")!.textContent = me.name ?? me.login ?? "";
        this.shadowRoot!.getElementById("mLogin")!.textContent = me.login ? "@" + me.login : "";
      } else {
        st.textContent = "未连接";
        (this.shadowRoot!.getElementById("meBox") as HTMLElement).classList.add("hidden");
      }
    } catch (e) {
      st.className = "status"; st.textContent = "查询失败";
      this.setMsg((e as Error).message, "err");
    }
  }
  private async login(): Promise<void> {
    const u = (this.shadowRoot!.getElementById("u") as HTMLInputElement).value.trim();
    const t = (this.shadowRoot!.getElementById("t") as HTMLInputElement).value.trim();
    if (!u || !t) { this.setMsg("请填用户名 + token", "err"); return; }
    this.setMsg("连接中…", "ok");
    const r = await this.call("POST", "/login", { username: u, token: t });
    if (r?.ok) { this.setMsg("连接成功 ✔︎", "ok"); (this.shadowRoot!.getElementById("t") as HTMLInputElement).value = ""; await this.refresh(); }
    else this.setMsg(r?.reason ?? "连接失败", "err");
  }
  private async logout(): Promise<void> {
    await this.call("POST", "/logout");
    (this.shadowRoot!.getElementById("u") as HTMLInputElement).value = "";
    await this.refresh();
    this.setMsg("已退出");
  }
}
