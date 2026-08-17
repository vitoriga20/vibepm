// 加载器：扫描插件目录 → 解析元数据 → 合成配置 → 挂载进 Context（照 Python loader.py + dsh app-boot）
import { Context } from "./context.js";
import { resolvePluginObject } from "./registry.js";

export const DEFAULT_BUNDLES: Record<string, string[]> = {
  minimal: [
    "storage", "github-source", "scheduler", "web-ui", "minimal-view",
    "field-goal", "field-priority", "field-status", "field-tags",
    "field-notes", "field-todo",
  ],
};

// entry id → 插件目录相对路径（镜像 Python ENTRY_TO_MODULE；统一指向 index，import .js specifier）
const ENTRY_DIR: Record<string, string> = {
  "storage": "storage",
  "github-source": "github_source",
  "scheduler": "scheduler",
  "web-ui": "web_ui",
  "minimal-view": "minimal_view",
  "field-goal": "fields/goal",
  "field-priority": "fields/priority",
  "field-status": "fields/status",
  "field-tags": "fields/tags",
  "field-notes": "fields/notes",
  "field-todo": "fields/todo",
};

export function availableEntries(): string[] {
  return Object.keys(ENTRY_DIR);
}

export function buildBootConfig(
  config: Record<string, any>,
  patchLayers?: Array<Record<string, Record<string, any>>>,
  bundles?: Record<string, string[]>,
  directPlugins?: Record<string, unknown>,
): { order: string[]; per: Record<string, Record<string, any>> } {
  bundles = bundles ?? DEFAULT_BUNDLES;
  const order: string[] = [];
  const seen = new Set<string>();
  let blist = config.bundles ?? ["minimal"];
  if (typeof blist === "string") blist = [blist];
  for (const b of blist) {
    for (const p of bundles[b] ?? []) {
      if (!seen.has(p)) { seen.add(p); order.push(p); }
    }
  }
  for (const p of Object.keys(directPlugins ?? {})) {
    if (!seen.has(p)) { seen.add(p); order.push(p); }
  }
  let legacy = config.plugins ?? [];
  if (typeof legacy === "object" && !Array.isArray(legacy)) legacy = legacy.enabled ?? legacy.plugins ?? [];
  if (typeof legacy === "string") legacy = [legacy];
  for (let p of legacy ?? []) {
    if (typeof p === "object" && p !== null) p = p.name ?? p.id;
    if (p && !seen.has(p)) { seen.add(p); order.push(p); }
  }
  const per: Record<string, Record<string, any>> = {};
  for (const name of order) {
    let merged = { ...((config[name] ?? {}) as Record<string, any>) };
    for (const layer of patchLayers ?? []) {
      if (name in layer) merged = { ...layer[name] };
    }
    per[name] = merged;
  }
  return { order, per };
}

async function importPlugin(entry: string, direct?: unknown): Promise<unknown> {
  if (direct !== undefined) return direct;
  const dir = ENTRY_DIR[entry] ?? entry;
  const specifier = new URL(`../plugins/${dir}/index.js`, import.meta.url).href;
  const mod = await import(specifier);
  return mod;
}

export interface BootResult {
  ctx: Context;
  order: string[];
  skipped: string[];
  errors: Error[];
}

export async function boot(
  config: Record<string, any>,
  patchLayers?: Array<Record<string, Record<string, any>>>,
  bundles?: Record<string, string[]>,
  direct?: Record<string, unknown>,
  scope?: string,
): Promise<BootResult> {
  const { order, per } = buildBootConfig(config, patchLayers, bundles, direct);
  const ctx = new Context({ config, scope, loader: null });
  const skipped: string[] = [];
  for (const entry of order) {
    try {
      const directPlugin = direct?.[entry];
      const mod = await importPlugin(entry, directPlugin);
      const { plugin } = resolvePluginObject(mod, entry);
      ctx.plugin(plugin, per[entry], entry);
    } catch (e) {
      skipped.push(`${entry}: ${(e as Error).message}`);
      ctx.bootErrors.push(e as Error);
    }
  }
  ctx.settle();
  return { ctx, order, skipped, errors: ctx.bootErrors };
}