// @ts-ignore TS 无法识别浏览器专用的 URL 模块
import { modules } from "/plugins/plugin-ide-view/module-system.js";
import { PluginManagerPanel } from "./components.js";

modules.register("plugin-plugin-manager", () => ({
  name: "plugin-plugin-manager",
  inject: [],
  provide: [],
  apply(_ctx: unknown) {
    if (!customElements.get("plugin-manager-panel")) {
      customElements.define("plugin-manager-panel", PluginManagerPanel);
    }
  },
}));