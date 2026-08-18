/**
 * plugin-github · client 端入口
 *  - 注册 4 个自定义元素（认证 / 仓库列表 / 仓库详情 / 面板头像）+ render 注册表。
 *  - 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL。
 */
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import {
  GithubAuthPanel, GithubReposPanel, GithubRepoDetailPanel, GithubAvatar,
} from "./components.js";
import {
  PANEL_KIND_AUTH, PANEL_KIND_REPOS, PANEL_KIND_DETAIL, PANEL_KIND_AVATAR,
} from "./constants.js";

modules.register("plugin-github", () => ({
  name: "plugin-github",
  inject: [],
  provide: [],
  apply(ctx: unknown) {
    const define = (kind: string, cls: CustomElementConstructor): void => {
      if (!customElements.get(kind)) customElements.define(kind, cls);
    };
    define(PANEL_KIND_AUTH, GithubAuthPanel);
    define(PANEL_KIND_REPOS, GithubReposPanel);
    define(PANEL_KIND_DETAIL, GithubRepoDetailPanel);
    define(PANEL_KIND_AVATAR, GithubAvatar);
    // 面板注册：kind → 标签名（壳查 render 注册表渲染，不硬编码）
    try {
      const r = (ctx as any).services.get("render");
      for (const kind of [PANEL_KIND_AUTH, PANEL_KIND_REPOS, PANEL_KIND_DETAIL]) r.register(kind, kind);
    } catch { /* noop */ }
  },
}));
