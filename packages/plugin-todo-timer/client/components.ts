/**
 * todo-timer-panel：TODO番茄钟面板
 *  - 整个自研预览页（时钟/ToDo/统计/设置）以独立 HTML 打包进 client-dist/preview，
 *    本组件用 iframe 嵌入（src 经壳 /plugins/<id>/<relPath> 静态服务）。
 *  - 最大化复用：页面零改动，仅外壳一层 iframe。
 *  - 数据导入（desktop-spec §5，M1 一次性迁移）：浏览器导出的 todoList JSON 粘贴写入
 *    本机 localStorage（契约键 taskListStorageFullKey()），既有 iframe 上报链路自然同步；
 *    存储键同包 import 契约单一源，不写字面量。
 */
import { taskListStorageFullKey } from "../src/contract.js";

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
.importer {
  margin: 10px 0;
  border: 1px solid var(--line, #3a4046);
  border-left: 3px solid var(--accent, #147d78);
  background: var(--panel, #16191c);
  padding: 12px 14px;
  font: 12px/1.6 var(--mono, monospace);
  color: var(--ink, #f6f7f3);
}
.importer summary { cursor: pointer; letter-spacing: 1px; font-weight: 700; color: var(--muted, #9aa0a7); }
.importer textarea {
  width: 100%;
  min-height: 96px;
  margin: 10px 0 8px;
  background: var(--bg-deep, #0d0f11);
  border: 1px solid var(--line, #383d43);
  color: inherit;
  font: inherit;
  resize: vertical;
  box-sizing: border-box;
}
.importer textarea:focus { outline: none; border-color: var(--accent, #147d78); }
.importer button {
  border: 1px solid var(--line, #5f656b);
  background: var(--panel-dark, #303438);
  color: inherit;
  padding: 5px 14px;
  cursor: pointer;
  font: 700 11px/1 var(--mono, monospace);
}
.importer button:hover { border-color: var(--accent, #147d78); color: var(--accent, #147d78); }
.importer .msg { margin-left: 10px; }
.importer .msg.ok { color: var(--ink-ok, #7ad97a); }
.importer .msg.err { color: var(--danger, #ff9c98); }
`;

export class TodoTimerPanel extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.innerHTML = `
      <style>${CSS}</style>
      <iframe src="/plugins/plugin-todo-timer/preview/index.html"></iframe>
      <details class="importer">
        <summary>导入数据（浏览器 → 本机一次性迁移）</summary>
        <p>
          在浏览器工作台的番茄钟页 DevTools 控制台执行
          <code>copy(localStorage.getItem(${JSON.stringify(taskListStorageFullKey())}))</code>
          导出整串 JSON，粘贴到下面导入。导入写入本机并提示刷新。
        </p>
        <textarea id="imp" placeholder="粘贴 todoList JSON（须含 current / done / statistics 字段）"></textarea>
        <button id="impBtn">校验并导入</button><span id="impMsg" class="msg"></span>
      </details>
    `;
    this.shadowRoot!.getElementById("impBtn")!.addEventListener("click", () => this.import());
  }

  private setStatus(text: string, kind: "ok" | "err"): void {
    const el = this.shadowRoot!.getElementById("impMsg")!;
    el.className = "msg " + kind;
    el.textContent = text;
  }

  private import(): void {
    const raw = (this.shadowRoot!.getElementById("imp") as HTMLTextAreaElement).value.trim();
    if (!raw) { this.setStatus("请先粘贴 JSON", "err"); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { this.setStatus("JSON 解析失败", "err"); return; }
    // 结构抽查（spec §5）：current/done/statistics 三字段在且类型正确
    const o = parsed as Record<string, unknown> | null;
    const okShape =
      !!o && typeof o === "object" &&
      Array.isArray(o.current) && Array.isArray(o.done) && Array.isArray(o.statistics);
    if (!okShape) { this.setStatus("结构不符：缺少 current / done / statistics", "err"); return; }
    try { localStorage.setItem(taskListStorageFullKey(), JSON.stringify(o)); }
    catch { this.setStatus("写入 localStorage 失败", "err"); return; }
    this.setStatus("已导入 ✓ 刷新页面生效（预览页自动上报服务端）", "ok");
    (this.shadowRoot!.getElementById("imp") as HTMLTextAreaElement).value = "";
  }
}
