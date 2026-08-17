// @ts-ignore TS 无法识别浏览器专用的 URL 模块
import { modules } from "/plugins/plugin-ide-view/module-system.js";
import { GithubAuthPanel } from "./components.js";

modules.register("plugin-github-auth", () => ({
  name: "plugin-github-auth",
  inject: [],
  provide: [],
  apply(_ctx: unknown) {
    if (!customElements.get("github-auth-panel")) {
      customElements.define("github-auth-panel", GithubAuthPanel);
    }
  },
}));
