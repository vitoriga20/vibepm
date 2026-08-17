// 加载器 v2（manifest 扫描版；对齐 dsh loader 思想）
// 取代旧 loader.ts：不再硬编码 ENTRY_DIR，扫描 packages/* 下所有带 vibepm manifest 的包
// 1) 早期注入 slots + bootGraph 服务
// 2) 根据 bundles 组合插件启动顺序
// 3) 双面插件（node + client）只在 Node 侧挂载 apply，client 侧由前端壳加载
import { Context } from "./context.js";
import { resolvePluginObject } from "./registry.js";
import { scanWorkspace, type ResolvedEntry } from "./manifest.js";
import { slotsPlugin } from "./slots.js";
import { clientModulesPlugin } from "./client-modules.js";

export const DEFAULT_BUNDLES: Record<string, string[]> = {
  minimal: [
    "plugin-storage",
    "plugin-web-ui",
    "plugin-ide-view",
    // dsh 风格核心 4 件套（均为插件；不想用只需移出 bundle）
    "plugin-onboarding",
    "plugin-github-auth",
    "plugin-settings",
    "plugin-repo-feed",
    "plugin-plugin-manager",
  ],
};

/**
 * 内核三件套：shell 自身依赖，永远不可在设置里关闭。
 * plugin-plugin-manager 不在此列 → 可关，但关了就没法再从 UI 关别的，保留推荐已锁定三类。
 */
export const PROTECTED_CORE = new Set<string>([
  "plugin-storage",
  "plugin-web-ui",
  "plugin-ide-view",
]);

export const PLUGINS_ENABLED_KEY = "plugins.enabled";

/** 老 entryId → 旧插件目录相对 src/plugins 的映射（过渡期保留） */
const LEGACY_ENTRY_DIR: Record<string, string> = {
  "storage": "storage",
  "plugin-storage": "storage",
  "github-source": "github_source",
  "scheduler": "scheduler",
  "web-ui": "web_ui",
  "plugin-web-ui": "web_ui",
  "minimal-view": "minimal_view",
  "ide-view": "ide_view",
  "plugin-ide-view": "ide_view",
  "field-goal": "fields/goal",
  "field-priority": "fields/priority",
  "field-status": "fields/status",
  "field-tags": "fields/tags",
  "field-notes": "fields/notes",
  "field-todo": "fields/todo",
};

export function availableEntries(workspaceRoot?: string): string[] {
  const fromWs = [...scanWorkspace(workspaceRoot).keys()];
  const fromLegacy = Object.keys(LEGACY_ENTRY_DIR);
  const s = new Set<string>([...fromWs, ...fromLegacy]);
  return [...s];
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

async function importFromWorkspace(entry: string, ws: Map<string, ResolvedEntry>, direct?: unknown): Promise<{ mod: unknown; source: "ws" | "legacy" | "direct" }> {
  if (direct !== undefined) return { mod: direct, source: "direct" };
  const fromWs = ws.get(entry);
  if (fromWs && fromWs.nodeEntry) {
    const specifier = "file://" + fromWs.nodeEntry.replace(/\\/g, "/");
    const mod = await import(specifier);
    return { mod, source: "ws" };
  }
  // 回退到老 src/plugins/<dir>/index.js（过渡期）
  const dir = LEGACY_ENTRY_DIR[entry] ?? entry;
  const legacySpecifier = new URL(`../../../src/plugins/${dir}/index.js`, import.meta.url).href;
  try {
    const mod = await import(legacySpecifier);
    return { mod, source: "legacy" };
  } catch {
    throw new Error(`plugin entry not found in workspace or legacy: ${entry}`);
  }
}

export interface BootResult {
  ctx: Context;
  order: string[];
  skipped: string[];
  disabled: string[];
  errors: Error[];
  workspaceEntries: Map<string, ResolvedEntry>;
}

export async function boot(
  config: Record<string, any>,
  patchLayers?: Array<Record<string, Record<string, any>>>,
  bundles?: Record<string, string[]>,
  direct?: Record<string, unknown>,
  scope?: string,
  workspaceRoot?: string,
): Promise<BootResult> {
  const { order, per } = buildBootConfig(config, patchLayers, bundles, direct);
  const wsEntries = scanWorkspace(workspaceRoot);
  const ctx = new Context({ config, scope, loader: null });
  const skipped: string[] = [];
  const disabled: string[] = [];
  // Step 0: 先提供 slots + bootGraph（两个基础服务不属于 bundle 组合，永远存在）
  ctx.plugin(slotsPlugin(), {}, "slots");
  ctx.plugin(clientModulesPlugin(workspaceRoot), {}, ClientModuleHost_NAME());
  // 冷启动开关：storage(提供 db) 是最先的插件，load 它之后再读 settings 的 plugins.enabled
  // 决定后续插件是否跳过加载（dsh 等价物：profile user-layer patch）
  let dbReady = false;
  for (const entry of order) {
    if (ctx.has("db") && !dbReady) {
      dbReady = true;
      const db = ctx.get("db") as any;
      const enabledMap: Record<string, boolean> | null =
        typeof db?.getSetting === "function" ? db.getSetting(PLUGINS_ENABLED_KEY) ?? null : null;
      for (const e of order) {
        if (enabledMap && enabledMap[e] === false && !PROTECTED_CORE.has(e) && e !== entry && !disabled.includes(e)) {
          disabled.push(e);
        }
      }
    }
    if (disabled.includes(entry)) continue;
    try {
      const directPlugin = direct?.[entry];
      const { mod } = await importFromWorkspace(entry, wsEntries, directPlugin);
      const { plugin } = resolvePluginObject(mod as any, entry);
      ctx.plugin(plugin, per[entry], entry);
    } catch (e) {
      skipped.push(`${entry}: ${(e as Error).message}`);
      ctx.bootErrors.push(e as Error);
    }
  }
  ctx.settle();
  return { ctx, order, skipped, disabled, errors: ctx.bootErrors, workspaceEntries: wsEntries };
}

function ClientModuleHost_NAME(): string { return "bootGraph"; }
