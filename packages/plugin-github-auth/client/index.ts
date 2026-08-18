// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import { GithubAuthPanel } from "./components.js";

modules.register("plugin-github-auth", () => ({
  name: "plugin-github-auth",
  inject: [],
  provide: [],
  apply(ctx: unknown) {
    if (!customElements.get("github-auth-panel")) {
      customElements.define("github-auth-panel", GithubAuthPanel);
    }
    // 面板注册：kind → 标签名（壳查表渲染，不硬编码）
    try { (ctx as any).services.get("render").register("github-auth-panel", "github-auth-panel"); } catch { /* noop */ }
  },
}));
