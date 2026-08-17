// 插件元数据解析（callable / 对象含 apply / 类 三形态）
import { PluginLoadError } from "./errors.js";

export interface PluginMeta {
  name: string;
  plugin: unknown;
  provide: string[];
  inject: string[];
}

function toArray(x: unknown): string[] {
  if (x === null || x === undefined) return [];
  if (typeof x === "string") return [x];
  if (Array.isArray(x)) return [...x];
  return [];
}

/** 从插件对象解析元数据。三形态：callable(apply) / 对象含 apply / 类 */
export function resolvePlugin(plugin: unknown, name?: string): PluginMeta {
  const anyPlugin = plugin as any;
  const provided: string[] = toArray(anyPlugin?.provide);
  const injected: string[] = toArray(anyPlugin?.inject);
  const pname = name ?? anyPlugin?.name ?? "plugin";
  return { name: pname, plugin, provide: provided, inject: injected };
}

/** 从模块提取插件对象：优先表/单插件/自身 apply */
export function resolvePluginObject(module: any, entryId: string): { plugin: unknown; id: string } {
  const table = module?.PLUGINS ?? module?.plugins;
  if (table && typeof table === "object" && entryId in table) {
    return { plugin: table[entryId], id: entryId };
  }
  const single = module?.PLUGIN;
  if (single !== null && single !== undefined && typeof (single as any).apply === "function") {
    return { plugin: single, id: entryId };
  }
  if (module && typeof module.apply === "function") {
    return { plugin: module, id: entryId };
  }
  throw new PluginLoadError(`cannot resolve plugin for entry: ${entryId}`);
}
