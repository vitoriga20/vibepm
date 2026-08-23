/**
 * plugin-todo-timer: Client 半
 *  - 定义 <todo-timer-panel> 自定义元素（iframe 嵌入 preview 页面）
 *  - 装 todo.sync 壳侧桥：iframe postMessage → POST node 半（todoTimer 服务数据源）
 *  - 经 window.__VIBEPM_MODULES__.register 注册；RenderRegistry 把 kind → 标签名
 */
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import { TodoTimerPanel } from "./components.js";
import { installTodoSyncBridge } from "./bridge.js";

modules.register("plugin-todo-timer", () => ({
  name: "plugin-todo-timer",
  inject: [],
  provide: [],
  apply(ctx: unknown) {
    if (!customElements.get("todo-timer-panel")) {
      customElements.define("todo-timer-panel", TodoTimerPanel);
    }
    // 面板注册：kind → 标签名（壳查表渲染，不硬编码）
    try {
      (ctx as any).services.get("render").register("todo-timer-panel", "todo-timer-panel");
    } catch { /* noop */ }
    // 数据桥：上报成功后经 ctx.events 广播，消费面板（日历）监听刷新
    installTodoSyncBridge((ctx as any)?.events);
  },
}));
