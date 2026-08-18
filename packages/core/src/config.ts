// 配置系统（镜像 Python config.py 语义；用 JSON 持久化，随后可换 toml）
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export class ConfigError extends Error {}

export function configDir(): string {
  return join(homedir(), ".vibepm");
}
export function profilePath(): string {
  return join(configDir(), "vibepm.json");
}
export function dbPath(): string {
  return join(configDir(), "vibepm.db");
}
/** 用户第三方插件安装目录（`vibepm plugin <pkg>` 的 pnpm 工作区），对齐 dsh profile 包目录思想 */
export function pluginsDir(): string {
  return join(configDir(), "plugins");
}

export function defaultProfile(): Record<string, any> {
  return {
    general: { sync_interval_min: 60 },
    github: { owner: "" },
    storage: { path: dbPath() },
    web_ui: { host: "127.0.0.1", port: 8080, open_browser: true },
    bundles: ["minimal"],
  };
}

export function loadProfile(path?: string): Record<string, any> {
  const p = path ?? profilePath();
  if (!existsSync(p)) throw new ConfigError(`profile not found: ${p}`);
  return JSON.parse(readFileSync(p, "utf-8"));
}

export function saveProfile(path: string, data: Record<string, any>): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

export function ensureProfile(): Record<string, any> {
  const p = profilePath();
  if (!existsSync(p)) saveProfile(p, defaultProfile());
  return loadProfile(p);
}

export function applyPatch(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value) && typeof merged[key] === "object" && merged[key] !== null) {
      merged[key] = applyPatch(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export function mergeLayers(...layers: Array<Record<string, Record<string, any>> | undefined>): Record<string, Record<string, any>> {
  const result: Record<string, Record<string, any>> = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [rid, cfg] of Object.entries(layer)) result[rid] = { ...cfg };
  }
  return result;
}
