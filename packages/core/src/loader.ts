// 加载器 v3（manifest 扫描 + patch 层叠；对齐 dsh loader + bundle patch 思想）
// 取代旧 loader.ts：
//   1) 早期注入 slots + bootGraph 服务
//   2) 插件组合 = base 层(builtin bundles) ← workspace bundle patch 层(依赖序) ← 已安装插件层 ← profile/CLI patch
//   3) 校验 schema，失败插件进 skipped（插件级隔离）
//   4) 双面插件 (node + client) 只在 Node 侧挂载 apply，client 侧由前端壳加载
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Context } from "./context.js";
import { resolvePluginObject } from "./registry.js";
import {
  scanWorkspace,
  entryIdFromPkgName,
  type ResolvedEntry,
  type PluginSchema,
} from "./manifest.js";
import { slotsPlugin } from "./slots.js";
import { clientModulesPlugin, ClientModuleHost } from "./client-modules.js";
import { resolvePluginRows, configLayerToRows, type PatchRow } from "./patches.js";
import { validatePluginConfig } from "./schema.js";
import { pluginsDir } from "./config.js";

export const PLUGINS_ENABLED_KEY = "plugins.enabled";

function readJson(abs: string): any {
  try {
    return JSON.parse(readFileSync(abs, "utf-8"));
  } catch {
    return null;
  }
}

export function availableEntries(workspaceRoot?: string): string[] {
  return [...scanWorkspace(workspaceRoot).keys()];
}

/** 插件可见元信息（给 UI 插件管理 / 外部工具枚举） */
export type EntryMeta = {
  /** entryId（组合层/列表的稳定键） */
  id: string;
  /** npm 包名（如 @vibepm-contrib/plugin-hello） */
  pkgName: string;
  /** 包的绝对目录（扫到才给；老 legacy 没有） */
  pkgDir: string | null;
  /** package.json.description，供 UI 做显示回退 */
  description: string | null;
};

/**
 * 枚举「所有内核能识别的可见插件」= 三源合并去重。
 * 顺序不保证；UI 端自己按业务排序。
 *
 * 源 1) workspace packages/*（manifest 扫描，同 availableEntries 数据源）
 * 源 2) 用户全局 pluginsDir（~/.vibepm/plugins）中 config.vibepm.pluginLayers 已声明的三方包
 * 源 3) 运行时兜底 fallbackIds（默认插件集由运行时提供，保持与组合层一致）
 */
export function enumerateAllEntries(workspaceRoot?: string, fallbackIds?: string[]): EntryMeta[] {
  const out = new Map<string, EntryMeta>();

  // 源 1：workspace（packages/* + legacy）
  const ws = scanWorkspace(workspaceRoot);
  for (const [id, info] of ws) {
    const pkgDir: string | null = info.pkgDir ?? null;
    const pkgJson = pkgDir ? readJson(join(pkgDir, "package.json")) : null;
    const pkgName: string = (pkgJson && typeof (pkgJson as any).name === "string") ? (pkgJson as any).name : info.pkgName || id;
    const desc: string | null = (pkgJson && typeof (pkgJson as any).description === "string") ? (pkgJson as any).description : null;
    if (!out.has(id)) out.set(id, { id, pkgName, pkgDir, description: desc });
  }

  // 源 2：pluginsDir 中已声明的三方包（vibepm.pluginLayers）
  const pj = readJson(join(pluginsDir(), "package.json"));
  const layersAny: any = pj?.vibepm?.pluginLayers;
  const layers: string[] = Array.isArray(layersAny) ? layersAny.filter((x: any) => typeof x === "string") : [];
  for (const name of layers) {
    const pkgDir = join(pluginsDir(), "node_modules", name);
    const pkgJson = readJson(join(pkgDir, "package.json"));
    if (!pkgJson || typeof pkgJson !== "object") continue;
    const id = entryIdFromPkgName(name);
    if (out.has(id)) continue;
    const pkgNameOut: string = typeof pkgJson.name === "string" ? pkgJson.name : name;
    const descOut: string | null = typeof pkgJson.description === "string" ? pkgJson.description : null;
    out.set(id, {
      id,
      pkgName: pkgNameOut,
      pkgDir,
      description: descOut,
    });
  }

  // 源 3：运行时兜底（默认插件集由运行时提供，内核不持有）
  for (const id of fallbackIds ?? []) {
    if (out.has(id)) continue;
    out.set(id, { id, pkgName: id, pkgDir: null, description: null });
  }

  return [...out.values()];
}

/**
 * 把运行时提供的 bundle 名单（bundles 参数）转成 base patch 层（insert 行）。
 * base 层永远最先，构成插件组合的底座；后续 bundle 层按 id 覆盖它。
 */
function baseBundleRows(
  bundles: Record<string, string[]>,
  blist: string | string[],
  ws: Map<string, ResolvedEntry> | null,
): PatchRow[] {
  const list = Array.isArray(blist) ? blist : [blist];
  const rows: PatchRow[] = [];
  const seen = new Set<string>();
  for (const b of list) {
    for (const id of bundles[b] ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({ id, name: ws?.get(id)?.pkgName });
    }
  }
  return rows;
}

/** 解析 config.plugins 老直列（.enabled / .plugins / 数组）为补充行 */
function legacyPluginRows(config: Record<string, any>): PatchRow[] {
  let legacy = config.plugins ?? [];
  if (typeof legacy === "object" && !Array.isArray(legacy)) legacy = legacy.enabled ?? legacy.plugins ?? [];
  if (typeof legacy === "string") legacy = [legacy];
  const rows: PatchRow[] = [];
  for (let p of legacy ?? []) {
    if (typeof p === "object" && p !== null) p = p.name ?? p.id;
    if (p && typeof p === "string") rows.push({ id: p });
  }
  return rows;
}

/** 依赖序排序 bundle 层：被依赖的 bundle 排在前（其 patch 先生效依从 base） */
function orderBundles(entries: ResolvedEntry[]): ResolvedEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const done = new Set<string>();
  const out: ResolvedEntry[] = [];
  const visit = (id: string): void => {
    if (done.has(id)) return;
    done.add(id);
    const e = byId.get(id);
    if (!e) return;
    const pkg = readJson(join(e.pkgDir, "package.json"));
    for (const dep of Object.keys(pkg?.dependencies ?? {})) {
      const depId = entryIdFromPkgName(dep);
      if (byId.has(depId)) visit(depId);
    }
    out.push(e);
  };
  for (const e of entries) visit(e.id);
  return out;
}

/** 读一个 bundle entry 的 patch 文件为行数组（文件不存在 → 空层） */
function readBundleLayer(e: ResolvedEntry): PatchRow[] {
  if (!e.bundlePatch || !existsSync(e.bundlePatch)) return [];
  const parsed = readJson(e.bundlePatch);
  if (parsed === null) return [];
  try {
    return Array.isArray(parsed) ? (parsed as PatchRow[]) : [parsed as PatchRow];
  } catch {
    return [];
  }
}

/**
 * 收集已安装到 pluginsDir 的三方插件（config.vibepm.pluginLayers 列的包名）：
 * 返回其 ResolvedEntry（合并进 client/bootGraph）与其 patch 层。
 */
function loadInstalledBundles(pluginNames: string[]): { entries: ResolvedEntry[]; layers: PatchRow[] } {
  const entries: ResolvedEntry[] = [];
  const existing = new Set<string>();
  const layers: PatchRow[] = [];
  for (const name of pluginNames) {
    const pkgJson = join(pluginsDir(), "node_modules", name, "package.json");
    if (!existsSync(pkgJson)) {
      process.stderr.write(`vibepm: 已声明的插件 ${name} 未安装（缺失 ${pkgJson}），忽略\n`);
      continue;
    }
    const pkg = readJson(pkgJson);
    const manifest = pkg?.vibepm ?? {};
    const id = entryIdFromPkgName(name);
    if (existing.has(id)) continue;
    existing.add(id);
    const pkgDir = join(pluginsDir(), "node_modules", name);
    const resolveRel = (rel?: string | null, def?: string | null): string | null =>
      rel ? join(pkgDir, rel) : def != null ? join(pkgDir, def) : null;
    entries.push({
      id,
      pkgName: name,
      pkgDir,
      nodeEntry: resolveRel(manifest.node ? (pkg.main ?? "./dist/index.js") : null, null),
      clientEntry: resolveRel(manifest.client?.entry, manifest.client ? "./dist/client/index.js" : null),
      clientStyles: resolveRel(manifest.client?.styles ?? null, null),
      bundlePatch:
        manifest.bundle || pkg.vibepm?.bundle
          ? join(pkgDir, manifest.bundle?.patch ?? "./vibepm.patch.json")
          : null,
      manifest,
    });
    const patches = readBundleLayer(entries[entries.length - 1]);
    if (patches.length) layers.push(...patches);
  }
  return { entries, layers };
}

/** 已安装插件层包名：config 显式覆盖，否则读 pluginsDir/package.json 的 vibepm.pluginLayers */
function pluginLayerNames(config: Record<string, any>): string[] {
  if (Array.isArray(config?.vibepm?.pluginLayers)) return config.vibepm.pluginLayers;
  const pkg = readJson(join(pluginsDir(), "package.json"));
  return Array.isArray(pkg?.vibepm?.pluginLayers) ? pkg.vibepm.pluginLayers : [];
}

/**
 * 组装插件组合：base ← workspace bundle 层 ← 已安装插件层 ← 顶层 patch 层。
 * @param config 用户配置（bundles / plugins / vibepm.pluginLayers / 每插件 config）
 * @param patchLayers 顶层 patch 层（PatchRow[] 或旧 config-覆盖 Record<id,config>）
 * @param bundles builtin bundle 表
 * @param directPlugins 直接注入的插件表（测试用）
 */
export function buildBootConfig(
  config: Record<string, any>,
  patchLayers?: Array<Record<string, Record<string, any>> | PatchRow[]>,
  bundles?: Record<string, string[]>,
  directPlugins?: Record<string, unknown>,
): { order: string[]; per: Record<string, Record<string, any>>; disabled: string[] } {
  const bundlesTable: Record<string, string[]> = bundles ?? config?.vibepm?.runtime?.bundles ?? {};
  const ws = scanWorkspace();
  // base 层：builtin bundles + 老 config.plugins
  let blist = config.bundles ?? ["minimal"];
  if (typeof blist === "string") blist = [blist];
  const baseRows = baseBundleRows(bundlesTable, blist as string | string[], ws);
  // 老 config.plugins 直列也作为 base 补充行
  baseRows.push(...legacyPluginRows(config));
  // 各层行：base ← workspace bundle 层（依赖序） ← 已安装插件层 ← 用户 patch
  const wsBundles = orderBundles([...ws.values()].filter((e) => e.bundlePatch));
  const wsLayers: PatchRow[] = [];
  for (const e of wsBundles) wsLayers.push(...readBundleLayer(e));
  const installed = loadInstalledBundles(pluginLayerNames(config));
  const userLayers: Array<Record<string, Record<string, any>> | PatchRow[]> =
    patchLayers ?? [];
  const normalizedLayers: (PatchRow[] | string | object)[] = userLayers.map((layer) =>
    Array.isArray(layer) ? (layer as PatchRow[]) : configLayerToRows(layer as Record<string, Record<string, any>>),
  );
  const layers: (PatchRow[] | string | object)[] = [
    baseRows,
    wsLayers,
    installed.layers,
    ...normalizedLayers,
  ];
  const { order, per, disabled } = resolvePluginRows(layers);
  // direct plugins 尾部并入
  for (const id of Object.keys(directPlugins ?? {})) {
    if (!order.includes(id)) order.push(id);
  }
  return { order, per, disabled };
}

async function importFromWorkspace(entry: string, ws: Map<string, ResolvedEntry>, direct?: unknown): Promise<{ mod: unknown; source: "ws" | "direct" }> {
  if (direct !== undefined) return { mod: direct, source: "direct" };
  const fromWs = ws.get(entry);
  if (fromWs && fromWs.nodeEntry && existsSync(fromWs.nodeEntry)) {
    const specifier = "file://" + fromWs.nodeEntry.replace(/\\/g, "/");
    const mod = await import(specifier);
    return { mod, source: "ws" };
  }
  throw new Error(`plugin entry not found in workspace: ${entry}`);
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
  patchLayers?: Array<Record<string, Record<string, any>> | PatchRow[]>,
  bundles?: Record<string, string[]>,
  direct?: Record<string, unknown>,
  scope?: string,
  workspaceRoot?: string,
  protectedCore?: Iterable<string>,
): Promise<BootResult> {
  const { order, per, disabled: patchDisabled } = buildBootConfig(config, patchLayers, bundles, direct);
  const wsEntries = scanWorkspace(workspaceRoot);
  // 并入已安装插件 entry（供 /plugins/<id>/client.js 服务）
  const installed = loadInstalledBundles(pluginLayerNames(config));
  const ctx = new Context({ config, scope, loader: null });
  const skipped: string[] = [];
  const disabled: string[] = [...patchDisabled];
  // 壳插件不可被 patch 禁用（来源：config.vibepm.runtime.protected，由运行时注入）
  const protectedSet = new Set<string>([
    ...(Array.isArray(config?.vibepm?.runtime?.protected) ? config.vibepm.runtime.protected : []),
    ...(protectedCore ?? []),
  ]);
  for (const p of [...disabled]) if (protectedSet.has(p)) disabled.splice(disabled.indexOf(p), 1);
  // Step 0: 先提供 slots + bootGraph（基础服务不属于 bundle 组合）
  ctx.plugin(slotsPlugin(), {}, "slots");
  ctx.plugin(clientModulesPlugin(workspaceRoot), {}, ClientModuleHost.NAME);
  // 让 bootGraph 认识已安装插件
  const host = ctx.get(ClientModuleHost.NAME) as ClientModuleHost | undefined;
  if (host && installed.entries.length) host.mergeEntries(new Map(installed.entries.map((e) => [e.id, e])));
  // 冷启动开关：storage(提供 db) 是最先的插件，load 它之后再读 plugins.enabled
  // disabled 来源 = 全部 enabledMap[id]===false 且非内核（不只限 order：游离的 client-only 皮肤等也要剔除）
  let dbReady = false;
  const startupDisabled = new Set<string>();
  for (const entry of order) {
    if (ctx.has("db") && !dbReady) {
      dbReady = true;
      const db = ctx.get("db") as any;
      const enabledMap: Record<string, boolean> | null =
        typeof db?.getSetting === "function" ? db.getSetting(PLUGINS_ENABLED_KEY) ?? null : null;
      if (enabledMap && typeof enabledMap === "object") {
        for (const [id, on] of Object.entries(enabledMap)) {
          if (on === false && !protectedSet.has(id) && id !== entry && !startupDisabled.has(id)) {
            startupDisabled.add(id);
          }
        }
      }
    }
    if (disabled.includes(entry) || startupDisabled.has(entry)) continue;
    const wsEntry = wsEntries.get(entry) ?? installedEntriesMap(installed).get(entry);
    const schema: PluginSchema | undefined = wsEntry?.manifest?.node?.schema;
    const configErr = validatePluginConfig(entry, per[entry] ?? {}, schema);
    if (configErr) {
      skipped.push(`${entry}: ${configErr}`);
      ctx.bootErrors.push(new Error(configErr));
      continue;
    }
    try {
      const directPlugin = direct?.[entry];
      const merged: Array<[string, ResolvedEntry]> = [
        ...(wsEntries as Map<string, ResolvedEntry>),
        ...installed.entries.map<[string, ResolvedEntry]>((e) => [e.id, e]),
      ];
      const allWs = new Map<string, ResolvedEntry>(merged);
      const { mod } = await importFromWorkspace(entry, allWs, directPlugin);
      const { plugin } = resolvePluginObject(mod as any, entry);
      ctx.plugin(plugin, per[entry], entry);
    } catch (e) {
      skipped.push(`${entry}: ${(e as Error).message}`);
      ctx.bootErrors.push(e as Error);
    }
  }
  ctx.settle();
  // 冷启动 disabled 的插件 → 一并从 client bootGraph 剔除（对齐 dsh：禁用=组合层整体消失，client 半不再加载）
  const allDisabled = Array.from(new Set([...disabled, ...startupDisabled]));
  if (host && allDisabled.length) host.excludeMany(allDisabled);
  return { ctx, order, skipped, disabled: allDisabled, errors: ctx.bootErrors, workspaceEntries: wsEntries };
}

function installedEntriesMap(installed: { entries: ResolvedEntry[] }): Map<string, ResolvedEntry> {
  return new Map(installed.entries.map((e) => [e.id, e]));
}