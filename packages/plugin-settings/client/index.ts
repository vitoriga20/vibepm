// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import { SettingsPanel } from "./components.js";

modules.register("plugin-settings", () => ({
  name: "plugin-settings",
  inject: [],
  provide: [],
  apply(ctx: unknown) {
    if (!customElements.get("settings-panel")) {
      customElements.define("settings-panel", SettingsPanel);
    }
    // 面板注册：kind → 标签名（壳查表渲染，不硬编码）
    try { (ctx as any).services.get("render").register("settings-panel", "settings-panel"); } catch { /* noop */ }
  },
}));
