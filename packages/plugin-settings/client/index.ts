// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import { SettingsPanel } from "./components.js";

modules.register("plugin-settings", () => ({
  name: "plugin-settings",
  inject: [],
  provide: [],
  apply(_ctx: unknown) {
    if (!customElements.get("settings-panel")) {
      customElements.define("settings-panel", SettingsPanel);
    }
  },
}));
