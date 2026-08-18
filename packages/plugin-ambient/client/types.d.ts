/**
 * 声明 client 侧用到的非 TS 模块 URL：
 *  - 浏览器下动态加载：`/plugins/plugin-ide-view/module-system.js`；
 *  - tsc 找不到模块 → 这里 ambient 声明（避免 import 报错）。
 */
declare module "/plugins/plugin-ide-view/module-system.js" {
  type PluginApplyCtx = Record<string, unknown>;
  type ClientPlugin = {
    name: string;
    inject: string[];
    provide: string[];
    apply(ctx: PluginApplyCtx): (() => void) | void;
  };
  export const modules: {
    register(id: string, factory: () => ClientPlugin | Promise<ClientPlugin>): void;
    bootstrap(): Promise<void>;
  };
}