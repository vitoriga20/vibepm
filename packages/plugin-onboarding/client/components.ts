/**
 * onboarding 导航卡：<onboarding-nav-card>
 * - 显示一张 2x2 grid 卡片（左上图标 / 左中状态点 / 右上标题 / 底部说明 + 跳转链接）
 * - 点击整体 → 跳 href (#hash)
 *
 * 我们尽量 inline 样式、不依赖全局 CSS（因为插件 WC 的 shadow DOM 隔离）。
 */

const CSS = /* css */`
:host{display:block}
.card{
  position:relative;border:1px solid #3a4046;border-left:4px solid #626970;background:#1d2126;
  clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%);
  padding:14px 16px;cursor:pointer;transition:border-color .1s linear,background .1s linear,transform .1s linear;
  user-select:none;box-shadow:3px 4px 0 #050607;
}
.card:hover{border-color:var(--yellow,#fff44f);border-left-color:var(--yellow,#fff44f);background:#262b31;transform:translate(-1px,-1px)}
.card:active{background:#16191c}
.card::after{
  content:"";position:absolute;right:14px;top:50%;
  width:6px;height:6px;border-top:1px solid #9aa0a7;border-right:1px solid #9aa0a7;
  transform-origin:center;transform:translateY(-50%) rotate(45deg);
}
.head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.icon{width:28px;height:28px;border:1px solid #7b8188;background:#15181b;
  display:flex;align-items:center;justify-content:center;color:var(--yellow,#fff44f);flex:0 0 auto}
.icon svg{width:14px;height:14px}
.title{font-size:12px;color:#f6f7f3;letter-spacing:.4px;font-weight:700;font-family:var(--display-cjk, sans-serif)}
.status{margin-left:auto;font-size:9px;letter-spacing:1px;padding:3px 7px;
  border:1px solid #5f656b;color:#9aa0a7;text-transform:uppercase;font:700 9px/1 var(--mono, monospace)}
.status.active{color:#111;border-color:var(--yellow,#fff44f);background:var(--yellow,#fff44f);box-shadow:2px 2px 0 rgba(0,0,0,.5)}
.status.completed{color:#9aa0a7;border-color:#5f656b;background:#161a1e}
.desc{font-size:11px;color:#9aa0a7;line-height:1.55;letter-spacing:.15px;margin-right:14px}
`;

const icons: Record<string, string> = {
  github: `<path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.9.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.77.11 3.06.73.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/>`,
  settings: `<circle cx="12" cy="12" r="2.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
  feed: `<path d="M4 11a9 9 0 0 1 9 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 4a16 16 0 0 1 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="5" cy="19" r="1.4" fill="currentColor"/>`,
  help: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 9a2.5 2.5 0 0 1 4.8-.9c0 1.5-2.2 2-2.2 3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/>`,
};

export class OnboardingNavCard extends HTMLElement {
  static get observedAttributes() { return ["icon", "title", "desc", "state", "href"]; }
  connectedCallback(): void {
    this.attachShadow({ mode: "open" });
    this.render();
    this.addEventListener("click", () => {
      const href = this.getAttribute("href");
      if (href) location.hash = href.startsWith("#") ? href.slice(1) : href;
    });
  }
  attributeChangedCallback(): void { if (this.shadowRoot) this.render(); }
  private render(): void {
    const s = this.shadowRoot!;
    const icon = this.getAttribute("icon") ?? "help";
    const title = this.getAttribute("title") ?? "";
    const desc = this.getAttribute("desc") ?? "";
    const state = (this.getAttribute("state") ?? "idle") as "idle" | "active" | "completed";
    const stateLabel = state === "active" ? "去操作" : state === "completed" ? "已完成" : "未开始";
    s.innerHTML = `<style>${CSS}</style>
      <div class="card" tabindex="0" role="link">
        <div class="head">
          <span class="icon">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${icons[icon] ?? icons.help}</svg>
          </span>
          <div class="title">${title}</div>
          <div class="status ${state}">${stateLabel}</div>
        </div>
        <div class="desc">${desc}</div>
      </div>`;
  }
}
