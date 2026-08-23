/**
 * plugin-calendar: Client 半
 *  - 定义 <calendar-panel> 自定义元素（月视图多维度日历）
 *  - 经 window.__VIBEPM_MODULES__.register 注册；RenderRegistry 把 kind → 标签名
 */
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import { CalendarPanel } from "./components.js";

modules.register("plugin-calendar", () => ({
  name: "plugin-calendar",
  inject: [],
  provide: [],
  apply(ctx: unknown) {
    if (!customElements.get("calendar-panel")) {
      customElements.define("calendar-panel", CalendarPanel);
    }
    // 面板注册：kind → 标签名（壳查表渲染，不硬编码）
    try {
      (ctx as any).services.get("render").register("calendar-panel", "calendar-panel");
    } catch { /* noop */ }
    // 注入共享事件总线：todoTimer 上报成功派发 SYNC_EVENT → 面板立即拉新（替代纯 3s 轮询）
    CalendarPanel.syncBus = (ctx as any)?.events ?? null;
  },
}));
