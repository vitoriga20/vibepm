/**
 * `vibepm plugin <pnpm args...>` — 第三方插件管理 = 薄 pnpm forwarder。
 * 对齐 dsh `plugin` 命令：首次使用初始化 pluginsDir，转发 pnpm 到该目录执行，
 * 成功后 reconcile：已装依赖若声明 `vibepm.bundle` → 加入 layer 栈；丢失该声明 → 移除；
 * 无 bundle 声明的普通依赖仅告警不加入。
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pluginsDir } from "@vitoriga20/core";

const PLUGINS_PKG = "vibepm-plugins";

function readJson(abs: string): any {
  try {
    return JSON.parse(readFileSync(abs, "utf-8"));
  } catch {
    return null;
  }
}

interface PluginsManifest {
  name: string;
  private: boolean;
  dependencies: Record<string, string>;
  vibepm?: { pluginLayers?: string[] };
}

function ensurePluginsDir(): string {
  const dir = pluginsDir();
  if (!existsSync(join(dir, "package.json"))) {
    mkdirSync(dir, { recursive: true });
    const manifest: PluginsManifest = { name: PLUGINS_PKG, private: true, dependencies: {} };
    writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2), "utf-8");
    // pnpm ≥10 会阻断 git 依赖的 prepare 脚本，预置空 allowBuilds 并给出提示位
    if (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
      writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - '.'\nallowBuilds: {}\n", "utf-8");
    }
    process.stderr.write(`vibepm: 初始化插件目录 ${dir}\n`);
  }
  return dir;
}

function readPluginsManifest(dir: string): PluginsManifest {
  return readJson(join(dir, "package.json")) ?? { name: PLUGINS_PKG, private: true, dependencies: {} };
}

function writePluginsManifest(dir: string, manifest: PluginsManifest): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2), "utf-8");
}

/** 该依赖是否导出组合层（= 包 manifest 声明了 vibepm.bundle） */
function exportsPatch(packageName: string): boolean {
  const pkg = readJson(join(pluginsDir(), "node_modules", packageName, "package.json"));
  return Boolean(pkg?.vibepm?.bundle || pkg?.vibepm?.bundle?.patch);
}

/**
 * 按已安装态 reconcile layer 栈：安装态驱动，而非依赖 diff，
 * 因此 `update` 会激活「新版本里才声明 vibepm.bundle」的包。
 */
function reconcilePlugins(dir: string): void {
  const manifest = readPluginsManifest(dir);
  const dependencies = manifest.dependencies ?? {};
  const layers = manifest.vibepm?.pluginLayers ?? [];
  const depNames = Object.keys(dependencies);
  let changed = false;

  for (const packageName of depNames) {
    if (exportsPatch(packageName)) {
      if (!layers.includes(packageName)) {
        layers.push(packageName);
        changed = true;
        process.stdout.write(`vibepm: 已加入组合层 ${packageName}\n`);
      }
    } else {
      // 非 bundle 的依赖：仅提示，不炸流程
      if (!depNames.includes(packageName)) continue;
      process.stderr.write(
        `vibepm: ${packageName} 未声明 vibepm.bundle，作为普通依赖安装，不构成组合层\n`,
      );
    }
  }

  for (const packageName of [...layers]) {
    const stillInstalled = depNames.includes(packageName);
    const stillBundle = stillInstalled && exportsPatch(packageName);
    if (stillInstalled && !stillBundle) {
      layers.splice(layers.indexOf(packageName), 1);
      changed = true;
    } else if (!stillInstalled) {
      // 不在依赖里（被移除/改名）→ 移出层栈
      layers.splice(layers.indexOf(packageName), 1);
      changed = true;
    }
  }

  if (!changed) return;
  manifest.vibepm = { ...(manifest.vibepm ?? {}), pluginLayers: layers };
  writePluginsManifest(dir, manifest);
}

/** 重写相对路径 spec 锚定到用户调用目录（pnpm 在 pluginsDir 内执行） */
function anchorPathSpec(argument: string, cwd: string): string {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument);
  if (match?.groups?.path === undefined) return argument;
  const prefix = match.groups.prefix ?? "";
  return `${prefix}${resolve(cwd, match.groups.path)}`;
}

/**
 * 执行一次 `vibepm plugin`：必要时初始化目录 → 转发 pnpm → 成功后 reconcile。
 * @param args pnpm 参数（相对路径 spec 已锚定到调用目录）
 * @returns pnpm 退出码
 */
export function runPlugin(args: string[]): number {
  const dir = ensurePluginsDir();
  const cwd = process.cwd();
  const anchored = args.map((a) => anchorPathSpec(a, cwd));
  // Windows 经 .cmd shim 解析 pnpm，spawn 无 shell 会被 CVE-2024-27980 硬化拦截
  const result = spawnSync("pnpm", anchored, { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error !== undefined) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      process.stderr.write("vibepm: 未找到 pnpm，请先安装 pnpm 来管理插件\n");
      return 127;
    }
    throw result.error;
  }
  const exitCode = result.status ?? 1;
  if (exitCode === 0) {
    reconcilePlugins(dir);
  } else {
    process.stderr.write(`vibepm: pnpm 在插件目录 ${dir} 执行失败\n`);
    if (anchored.some((a) => /^git\+|^github:|\.git(?:#|$)/.test(a))) {
      process.stderr.write(
        `vibepm: git 插件依赖构建脚本被 pnpm 阻断，把 pnpm 打印的条目加进 ${join(dir, "pnpm-workspace.yaml")} 的 allowBuilds 后重跑\n`,
      );
    }
  }
  return exitCode;
}