/**
 * island-settings-panel：桌面灵动岛设置（主窗侧）。
 * 链路（spec desktop-spec.md §10.3）：面板（主窗, http://127.0.0.1 origin）emit Tauri 事件
 * → 岛窗（tauri://localhost origin）listener 即时生效并持久化到岛页 localStorage；
 * 回显走 control-request-config → island-config（跨源读不到岛 localStorage）。
 * 仅桌面壳环境可用（无 __TAURI_INTERNALS__ 时显示提示）。
 */

const CSS = /* css */`
:host{display:block}
h1{font-size:16px;letter-spacing:1.5px;color:var(--ink,#f6f7f3);margin:0 0 6px 0;font-weight:900;text-transform:uppercase;font-family:var(--display-cjk, sans-serif)}
.desc{font-size:12px;color:var(--ink-soft,#9aa0a7);margin-bottom:18px}
.group{border:1px solid var(--line,#3a4046);background:var(--panel,#16191c);padding:14px 16px;margin-bottom:14px;box-shadow:4px 4px 0 rgba(0,0,0,.4)}
.group h3{font-size:10px;color:var(--ink-soft,#9aa0a7);letter-spacing:1.2px;text-transform:uppercase;margin:0 0 12px 0;font-weight:700;font-family:var(--mono, monospace)}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line-soft,#2a2f34)}
.row:last-child{border-bottom:none}
.lab{font-size:12px;color:var(--ink,#f6f7f3)}
.lab .sub{display:block;font-size:10px;color:var(--ink-soft,#9aa0a7);margin-top:2px}
.sw{position:relative;width:34px;height:18px;border-radius:10px;background:var(--line,#5f656b);cursor:pointer;border:none;padding:0;transition:background .15s}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s}
.sw.on{background:var(--accent,#147d78)}
.sw.on::after{left:18px}
select,input[type=range]{accent-color:var(--accent,#147d78);background:var(--panel-deep,#0d0f11);color:var(--ink,#f6f7f3);border:1px solid var(--line,#383d43);font-size:11px;padding:4px 6px}
select{font-family:var(--mono, monospace);cursor:pointer}
input[type=range]{width:160px;padding:0}
.opval{font-family:var(--mono, monospace);font-size:11px;color:var(--accent,#147d78);min-width:36px;text-align:right}
button.act{border:1px solid var(--line,#5f656b);background:var(--panel-deep,#303438);color:var(--ink,#f6f7f3);padding:4px 10px;cursor:pointer;
  font:700 10px/1 var(--display-cjk, sans-serif);letter-spacing:.5px;box-shadow:2px 2px 0 rgba(0,0,0,.5);transition:color .18s,border-color .18s}
button.act:hover{border-color:var(--accent,#147d78);color:var(--accent,#147d78)}
.hint{font-size:11px;color:var(--ink-soft,#9aa0a7);margin-top:10px}
.unavailable{border:1px dashed #3c4147;border-left:3px solid var(--accent,#147d78);padding:14px;font-size:12px;color:var(--ink-soft,#9aa0a7)}
`;

type Cfg = Record<string, string | null>;

function invokeCmd(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const internals = (window as any).__TAURI_INTERNALS__;
  if (!internals) return Promise.reject(new Error("not in tauri webview"));
  return internals.invoke(cmd, args);
}

export class IslandSettingsPanel extends HTMLElement {
  private cfg: Cfg = {};
  private unlisten: (() => void) | null = null;

  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    void this.render();
  }

  disconnectedCallback(): void {
    if (this.unlisten) { this.unlisten(); this.unlisten = null; }
  }

  private bool(key: string, fallback: boolean): boolean {
    const v = this.cfg[key];
    if (v === null || v === undefined) return fallback;
    return v === "true";
  }

  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    if (!(window as any).__TAURI_INTERNALS__) {
      s.innerHTML = `<style>${CSS}</style>
        <h1>岛设置</h1>
        <div class="unavailable">灵动岛仅桌面壳（vibepm desktop）环境可用——浏览器预览里没有岛窗可配置。</div>`;
      return;
    }

    // 回读岛端配置（跨源拿不到岛 localStorage，走事件；超时用默认值兜底）
    this.cfg = {};
    const { emit, listen } = await import("@tauri-apps/api/event");
    const offCfg = await listen<Cfg>("island-config", (ev) => {
      this.cfg = ev.payload ?? {};
      void this.fill();
    });
    this.unlisten = offCfg;
    // 兜底：回读偶尔迟到（岛端注册链较长），先用默认值渲染，回包到达后再覆盖
    setTimeout(() => { if (Object.keys(this.cfg).length === 0) void this.fill(); }, 3500);
    await emit("control-request-config", null);

    s.innerHTML = `<style>${CSS}</style>
      <h1>岛设置</h1>
      <p class="desc">灵动岛行为与外观。设置经桌面事件下发到岛，即刻生效并持久化。</p>

      <div class="group"><h3>岛行为</h3>
        <div class="row"><span class="lab">媒体控制器<button class="sw" data-k="music"></button><span class="sub">SMTC 检测当前播放音乐，岛上显示歌曲与控制按钮</span></span></div>
        <div class="row"><span class="lab">静默模式<button class="sw" data-k="msgmode"></button><span class="sub">仅在音乐/消息等活动时显示岛</span></span></div>
        <div class="row"><span class="lab">全屏自动隐藏<button class="sw" data-k="autohide"></button><span class="sub">游戏/视频全屏时自动收起岛</span></span></div>
        <div class="row"><span class="lab">消息通知接收<button class="sw" data-k="msgnotify"></button><span class="sub">系统通知推送到岛（弹窗提醒）</span></span></div>
        <div class="row"><span class="lab">剪贴板链接检测<button class="sw" data-k="clipboard"></button><span class="sub">复制链接时岛上提示打开</span></span></div>
        <div class="row"><span class="lab">CPU / RAM 显示<button class="sw" data-k="sysresource"></button><span class="sub">资源占用条替代网速显示</span></span></div>
      </div>

      <div class="group"><h3>音乐源</h3>
        <div class="row"><span class="lab">目标媒体平台<span class="sub">SMTC 会话识别偏好</span></span>
          <select id="player">
            <option value="netease">网易云</option>
            <option value="spotify">Spotify</option>
            <option value="apple">Apple Music</option>
            <option value="qqmusic">QQ音乐</option>
            <option value="echo">回声</option>
            <option value="lx-music">洛雪</option>
            <option value="other">其他</option>
          </select></div>
      </div>

      <div class="group"><h3>岛外观</h3>
        <div class="row"><span class="lab">不透明度<span class="sub">岛背景透明度</span></span>
          <span style="display:flex;align-items:center;gap:8px"><input id="op" type="range" min="30" max="100" step="5"><span class="opval" id="opv"></span></span></div>
        <div class="row"><span class="lab">主题颜色<span class="sub">岛面配色</span></span>
          <select id="theme">
            <option value="black">深色</option>
            <option value="white">浅色</option>
            <option value="coverglass">封面玻璃</option>
          </select></div>
        <div class="row"><span class="lab">界面语言<span class="sub">岛内文案</span></span>
          <select id="lang">
            <option value="zh-CN">简体中文</option>
            <option value="en-US">English</option>
            <option value="ja-JP">日本語</option>
          </select></div>
      </div>

      <div class="group"><h3>系统</h3>
        <div class="row"><span class="lab">开机自启<button class="sw" data-k="autostart"></button><span class="sub">随系统启动并自动隐藏窗口</span></span></div>
        <div class="row"><span class="lab">岛显示<span class="sub">立即显示 / 隐藏灵动岛</span></span>
          <span style="display:flex;gap:6px"><button class="act" id="showisland">显示</button><button class="act" id="hideisland">隐藏</button></span></div>
      </div>

      <div class="hint">改动即刻下发到岛并持久化；「媒体控制器 / CPU RAM / FPS 显示」三者互斥（与 NSD 行为一致）。</div>`;

    void this.bind(s, emit);
  }

  private async fill(): Promise<void> {
    const s = this.shadowRoot!;
    // 开关态
    const states: Record<string, boolean> = {
      music: this.bool("nsd_music_ctrl", true),
      msgmode: this.bool("nsd_msg_mode", false),
      autohide: this.bool("nsd_autohide_fs", false),
      msgnotify: this.bool("nsd_msg_notify", false),
      clipboard: this.cfg["nsd_clipboard"] !== "false",
      sysresource: this.bool("nsd_sys_resource", false),
      autostart: false,
    };
    s.querySelectorAll<HTMLButtonElement>(".sw").forEach((b) => {
      const k = b.dataset.k!;
      if (k === "autostart") {
        void invokeCmd("plugin:autostart|is_enabled").then((v) => b.classList.toggle("on", !!v)).catch(() => { });
        return;
      }
      b.classList.toggle("on", states[k]);
    });
    const playerSel = s.getElementById("player") as HTMLSelectElement;
    const savedPlayer = this.cfg["nsd_target_player"] || "netease";
    // 已下架的选项（如 kugou，不注册 SMTC）回退默认
    playerSel.value = playerSel.querySelector(`option[value="${savedPlayer}"]`) ? savedPlayer : "netease";
    (s.getElementById("theme") as HTMLSelectElement).value = this.cfg["nsd_island_theme"] || "black";
    (s.getElementById("lang") as HTMLSelectElement).value = this.cfg["nsd_language"] || "zh-CN";
    const op = Number(this.cfg["nsd_island_opacity"] ?? "100") || 100;
    (s.getElementById("op") as HTMLInputElement).value = String(op);
    s.getElementById("opv")!.textContent = String(op);
  }

  private async bind(s: ShadowRoot, emit: (event: string, payload?: unknown) => Promise<void>): Promise<void> {
    // 互斥组（NSD 语义）：music / sysresource 互斥
    const exclusive: Record<string, string[]> = { music: ["sysresource"], sysresource: ["music"] };
    const eventOf: Record<string, string> = {
      music: "control-music-ctl",
      msgmode: "control-msg-mode",
      autohide: "control-autohide-fs",
      msgnotify: "control-msg-notify",
      clipboard: "control-clipboard",
      sysresource: "control-sys-resource",
    };

    s.querySelectorAll<HTMLButtonElement>(".sw").forEach((b) => {
      b.addEventListener("click", () => {
        const k = b.dataset.k!;
        if (k === "autostart") {
          const enabling = !b.classList.contains("on");
          void (enabling ? invokeCmd("plugin:autostart|enable") : invokeCmd("plugin:autostart|disable"))
            .then(() => b.classList.toggle("on", enabling)).catch(() => { });
          return;
        }
        const on = !b.classList.contains("on");
        b.classList.toggle("on", on);
        void emit(eventOf[k], { enabled: on });
        for (const other of exclusive[k] ?? []) {
          const ob = s.querySelector<HTMLButtonElement>(`.sw[data-k="${other}"]`);
          if (ob && on && ob.classList.contains("on")) {
            ob.classList.remove("on");
            void emit(eventOf[other], { enabled: false });
          }
        }
      });
    });

    s.getElementById("player")?.addEventListener("change", (ev) => {
      void emit("control-target-player", { player: (ev.target as HTMLSelectElement).value });
    });
    s.getElementById("theme")?.addEventListener("change", (ev) => {
      void emit("control-island-theme", { theme: (ev.target as HTMLSelectElement).value });
    });
    s.getElementById("lang")?.addEventListener("change", (ev) => {
      void emit("control-language", { language: (ev.target as HTMLSelectElement).value });
    });
    const op = s.getElementById("op") as HTMLInputElement | null;
    op?.addEventListener("input", () => {
      s.getElementById("opv")!.textContent = op.value;
    });
    op?.addEventListener("change", () => {
      void emit("control-island-opacity", { opacity: Number(op.value) });
    });
    s.getElementById("showisland")?.addEventListener("click", () => {
      void emit("control-island-visibility", { show: true });
    });
    s.getElementById("hideisland")?.addEventListener("click", () => {
      void emit("control-island-visibility", { show: false });
    });
  }
}
