/**
 * todo-timer-panel：TODO番茄钟面板
 *  - 整个自研预览页（时钟/ToDo/统计/设置）以独立 HTML 打包进 client-dist/preview，
 *    本组件用 iframe 嵌入（src 经壳 /plugins/<id>/<relPath> 静态服务）。
 *  - 最大化复用：页面零改动，仅外壳一层 iframe。
 */
const CSS = /* css */`
:host {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 640px;
  background: transparent;
}
iframe {
  width: 100%;
  height: 100%;
  min-height: 640px;
  border: 0;
  display: block;
  background: transparent;
}
`;

export class TodoTimerPanel extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.innerHTML = `
      <style>${CSS}</style>
      <iframe src="/plugins/plugin-todo-timer/preview/index.html" allow="autoplay"></iframe>
    `;
  }
}
