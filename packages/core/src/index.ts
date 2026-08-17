// 内核统一导出
export { Context, type AppLoaderLike } from "./context.js";
export { Disposable, effect, collect, seekDisposers, type Disposer } from "./disposable.js";
export { EventBus, MODE, type Handler } from "./eventbus.js";
export { Fiber, FiberError, PENDING, LOADING, ACTIVE, UNLOADING, FAILED, DISPOSED } from "./fiber.js";
export { Service, ServiceRegistry, ServiceNotFoundError, pluginProvides, pluginInjects } from "./services.js";
export { resolvePlugin, resolvePluginObject, type PluginMeta } from "./registry.js";
export { PluginLoadError, ConfigError } from "./errors.js";
export * from "./config.js";
export * from "./manifest.js";
export * from "./slots.js";
export * from "./client-modules.js";
export { boot, buildBootConfig, availableEntries, DEFAULT_BUNDLES, PROTECTED_CORE, PLUGINS_ENABLED_KEY, type BootResult } from "./loader.js";
