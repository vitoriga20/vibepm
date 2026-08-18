// 插件 manifest 契约：扫描 workspace 下所有带 `vibepm` 字段的 package.json
// 对齐 dsh 的插件 manifest 思路（dsh.client → vibepm.node / vibepm.client）
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 轻量 schema 字段：字段名 → 类型/必填（用于 validatePluginConfig） */
export type SchemaField = {
  type: "string" | "number" | "boolean" | "array" | "object" | "any";
  required?: boolean;
};
export type PluginSchema = Record<string, SchemaField>;

export interface VibePmNodeManifest {
  inject: string[];
  provide: string[];
  immediately?: boolean;
  schema?: PluginSchema;
}

export interface VibePmClientManifest {
  inject: string[];
  provide: string[];
  immediately?: boolean;
  /** client 入口相对包根路径，默认 "./dist/client/index.js" */
  entry?: string;
  /** 样式资源相对路径（可选） */
  styles?: string;
  schema?: PluginSchema;
}

export interface VibePmBundleManifest {
  /** 相对包根的 patch 文件路径，默认 "./vibepm.patch.json" */
  patch?: string;
}

export interface VibePmManifest {
  node?: VibePmNodeManifest;
  client?: VibePmClientManifest;
  bundle?: VibePmBundleManifest;
}

export interface ResolvedEntry {
  /** entry id（通常和 package.json name 对应，或 "@scope/pkg" → 去掉 scope 再归一） */
  id: string;
  /** npm 包名 */
  pkgName: string;
  /** package.json 所在目录（绝对路径） */
  pkgDir: string;
  /** Node 插件入口的绝对路径（import specifier），默认 = <pkgDir>/dist/index.js */
  nodeEntry: string | null;
  /** client bundle 入口的绝对路径（可选） */
  clientEntry: string | null;
  /** 样式 bundle 路径（可选） */
  clientStyles: string | null;
  /** bundle patch 文件绝对路径（该包声明 vibepm.bundle 时才有，否则 null） */
  bundlePatch: string | null;
  manifest: VibePmManifest;
}

/** 计算 content hash 简易版：读文件 stat mtime+size（精确足够开发场景） */
function statRev(absPath: string | null): string {
  if (!absPath || !existsSync(absPath)) return "0";
  try {
    const s = statSync(absPath);
    return `${s.size}-${s.mtimeMs.toFixed(0)}`;
  } catch {
    return "0";
  }
}

/**
 * 扫描 workspace packages 根（当前文件 ../../.. 对应 vibepm-ts/），
 * 返回 entry → ResolvedEntry 表。务实：不做 node_modules 穿透，
 * 只扫 packages/* 下一级目录 + 老 src/plugins/（过渡期兼容）。
 */
export function scanWorkspace(rootHint?: string): Map<string, ResolvedEntry> {
  const entries = new Map<string, ResolvedEntry>();
  let root = rootHint;
  if (!root) {
    try {
      // 当前文件通常在 <monorepo>/packages/core/dist 或 src
      const here = dirname(fileURLToPath(import.meta.url));
      // 往上走 3 层： packages/core/src -> packages/core -> packages -> <root>
      root = resolve(here, "..", "..", "..");
    } catch {
      root = process.cwd();
    }
  }
  const candidates: string[] = [];
  const packagesDir = join(root, "packages");
  if (existsSync(packagesDir)) {
    for (const name of readdirSync(packagesDir)) {
      const pkgDir = join(packagesDir, name);
      if (existsSync(join(pkgDir, "package.json"))) candidates.push(pkgDir);
    }
  }
  // 过渡期：老 src/plugins 下每个目录也算一个包（带 manifest 的才收）
  const legacyPlugins = join(root, "src", "plugins");
  if (existsSync(legacyPlugins)) {
    const walk = (d: string, depth = 0): void => {
      if (depth > 2) return;
      for (const child of readdirSync(d)) {
        const sub = join(d, child);
        if (!statSync(sub).isDirectory()) continue;
        if (existsSync(join(sub, "package.json"))) { candidates.push(sub); continue; }
        if (child === "fields") { walk(sub, depth + 1); continue; }
        // 老插件没有 package.json，不算（先忽略，后续再搬）
      }
    };
    walk(legacyPlugins);
  }
  for (const pkgDir of candidates) {
    const pkgJson = join(pkgDir, "package.json");
    let pkg: any;
    try { pkg = JSON.parse(readFileSync(pkgJson, "utf-8")); } catch { continue; }
    const manifest: VibePmManifest = pkg.vibepm ?? {};
    if (!manifest.node && !manifest.client) continue; // 没有 vibepm 字段 = 不是插件包
    const pkgName: string = pkg.name ?? pkgDir;
    const id = entryIdFromPkgName(pkgName);
    const nodeRel = manifest.node ? (pkg.main ?? "./dist/index.js") : null;
    const nodeEntry = nodeRel ? resolve(pkgDir, nodeRel) : null;
    const clientRel = manifest.client?.entry ?? (manifest.client ? "./dist/client/index.js" : null);
    const clientEntry = clientRel ? resolve(pkgDir, clientRel) : null;
    const stylesRel = manifest.client?.styles ?? null;
    const clientStyles = stylesRel ? resolve(pkgDir, stylesRel) : null;
    // bundle 层：声明 vibepm.bundle 的包 = 可安装组合层；未给定路径默认 ./vibepm.patch.json
    const bundlePatch =
      manifest.bundle || pkg.vibepm?.bundle
        ? resolve(pkgDir, pkg.vibepm?.bundle?.patch ?? "./vibepm.patch.json")
        : null;
    entries.set(id, { id, pkgName, pkgDir, nodeEntry, clientEntry, clientStyles, bundlePatch, manifest });
  }
  return entries;
}

export function entryIdFromPkgName(pkgName: string): string {
  // @vibepm/plugin-storage → plugin-storage；其余直接用
  let name = pkgName;
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash > 0) name = name.slice(slash + 1);
  }
  return name;
}

/** 生成本地 client boot graph（给 <script> 注入 window.__VIBEPM_BOOT__） */
export interface BootGraphRow {
  id: string;
  pkgName: string;
  /** client bundle 路由：/plugins/<id>/client.js */
  url: string;
  /** 带缓存 rev */
  rev: string;
  inject: string[];
  provide: string[];
  immediately: boolean;
  hasStyles: boolean;
}

export interface BootGraph {
  rev: string;
  entries: BootGraphRow[];
}

export function buildBootGraph(entries: Map<string, ResolvedEntry>): BootGraph {
  const rows: BootGraphRow[] = [];
  let acc = "";
  for (const e of entries.values()) {
    if (!e.manifest.client) continue;
    const cm = e.manifest.client;
    const rev = statRev(e.clientEntry);
    const row: BootGraphRow = {
      id: e.id,
      pkgName: e.pkgName,
      url: `/plugins/${e.id}/client.js`,
      rev,
      inject: cm.inject ?? [],
      provide: cm.provide ?? [],
      immediately: Boolean(cm.immediately),
      hasStyles: Boolean(e.clientStyles && existsSync(e.clientStyles)),
    };
    rows.push(row);
    acc += `${row.id}:${row.rev};`;
  }
  const graphRev = hashString(acc);
  return { rev: graphRev, entries: rows };
}

function hashString(s: string): string {
  // 简易 djb2
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}
