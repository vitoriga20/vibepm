/**
 * plugin-onboarding: client 端
 *  - 注册 Web Component: <onboarding-nav-card>
 *  - 监听 vibepm:ready（其实 apply 时已经 ready 了）→ render 所有 shell.nav slot 的卡片
 *    对应：从 window.__VIBEPM_SLOTS__.shell.nav 里读出，渲染到 <vibe-shell> 给 <div class="nav-cards">
 *    → 但是我们更直接：在 <vibe-shell> 里已经按 slot 渲染；只需要它的 renderer 能识别
 *      payload.kind === "nav-card" → 产出 <onboarding-nav-card> 即可。
 *  - 所以本 client plugin 只负责把 custom element 注册上去。
 */
// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import { OnboardingNavCard } from "./components.js";

modules.register("plugin-onboarding", () => ({
  name: "plugin-onboarding",
  inject: [],
  provide: [],
  apply(_ctx: unknown) {
    if (!customElements.get("onboarding-nav-card")) {
      customElements.define("onboarding-nav-card", OnboardingNavCard);
    }
  },
}));
