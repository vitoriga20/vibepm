// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import { IslandSettingsPanel } from "./components.js";

modules.register("plugin-island-settings", () => ({
  name: "plugin-island-settings",
  inject: [],
  provide: [],
  apply(ctx: unknown) {
    if (!customElements.get("island-settings-panel")) {
      customElements.define("island-settings-panel", IslandSettingsPanel);
    }
    try { (ctx as any).services.get("render").register("island-settings-panel", "island-settings-panel"); } catch { /* noop */ }
  },
}));
