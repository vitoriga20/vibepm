// 运行时组合定义（对齐 dsh 的 base bundle 层）。
// 内核不持有任何插件 id：默认插件集与「不可关闭」壳插件列表由运行时（CLI）持有，
// 并在 boot 前注入 config.vibepm.runtime，由 loader / plugin-manager 读取。
export const DEFAULT_BUNDLES: Record<string, string[]> = {
  minimal: [
    "plugin-storage",
    "plugin-web-ui",
    "plugin-ide-view",
    "plugin-onboarding",
    "plugin-github",
    "plugin-settings",
    "plugin-plugin-manager",
    "plugin-ambient",
  ],
};

/** 系统壳插件：storage(提供 db) / web-ui(提供服务) / ide-view(提供壳)，不可在设置里关闭 */
export const PROTECTED_CORE: string[] = ["plugin-storage", "plugin-web-ui", "plugin-ide-view"];
