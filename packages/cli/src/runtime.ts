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
    "plugin-island-settings",
    "plugin-plugin-manager",
    "plugin-ambient",
    "plugin-todo-timer",
    "plugin-calendar",
    "plugin-skin-rhine",
  ],
};

/** 系统壳插件：storage(提供 db) / web-ui(提供服务) / ide-view(提供壳)，不可在设置里关闭 */
export const PROTECTED_CORE: string[] = ["plugin-storage", "plugin-web-ui", "plugin-ide-view"];

/**
 * 内置插件 npm 包名（发布态：cli 的真实 dependencies，安装后位于 node_modules）。
 * 与 DEFAULT_BUNDLES 的 id 一一对应；core 据此从 node_modules 按包名解析（scanInstalled）。
 */
export const DEFAULT_PLUGIN_PACKAGES: string[] = [
  "@vitoriga20/plugin-storage",
  "@vitoriga20/plugin-web-ui",
  "@vitoriga20/plugin-ide-view",
  "@vitoriga20/plugin-onboarding",
  "@vitoriga20/plugin-github",
  "@vitoriga20/plugin-settings",
  "@vitoriga20/plugin-island-settings",
  "@vitoriga20/plugin-plugin-manager",
  "@vitoriga20/plugin-ambient",
  "@vitoriga20/plugin-todo-timer",
  "@vitoriga20/plugin-calendar",
  "@vitoriga20/plugin-skin-rhine",
];
