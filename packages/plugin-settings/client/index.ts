// @ts-ignore TS 无法识别浏览器专用的 URL 模块
import { modules } from "/plugins/plugin-ide-view/module-system.js";
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
