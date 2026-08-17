// @ts-ignore TS 无法识别浏览器专用的 URL 模块
import { modules } from "/plugins/plugin-ide-view/module-system.js";
import { FeedPanel } from "./components.js";

modules.register("plugin-repo-feed", () => ({
  name: "plugin-repo-feed",
  inject: [],
  provide: [],
  apply(_ctx: unknown) {
    if (!customElements.get("feed-panel")) {
      customElements.define("feed-panel", FeedPanel);
    }
  },
}));
