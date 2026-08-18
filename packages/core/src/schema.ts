// 插件配置 schema 校验（轻量，不引第三方）。与 manifest.PluginSchema 配套。
// 插件 package.json `vibepm.node.schema` / `vibepm.client.schema` 声明字段类型/必填，
// loader 装入前校验，失败 → 该插件进 skipped（插件级隔离，不炸整链）。

import type { PluginSchema } from "./manifest.js";

/**
 * 校验插件配置。通过返回 null；失败返回第一条错误消息。
 * @param id 插件 entry id（用于报错上下文）
 * @param config 待校验配置（resolvePluginRows 产出的该行 config）
 * @param schema 该插件声明的字段 schema（可选，缺省跳过校验）
 */
export function validatePluginConfig(id: string, config: Record<string, any>, schema?: PluginSchema): string | null {
  if (!schema) return null;
  const seen = new Set<string>();
  for (const [field, def] of Object.entries(schema)) {
    seen.add(field);
    const present = field in config;
    if (def.required && !present) {
      return `插件 ${id} 配置缺少必填字段 "${field}"`;
    }
    if (!present) continue;
    const value = config[field];
    const ok = matchesType(value, def.type);
    if (!ok) {
      return `插件 ${id} 字段 "${field}" 期望类型 ${def.type}，实际 ${describe(value)}`;
    }
  }
  return null;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && !Number.isNaN(value);
    case "boolean": return typeof value === "boolean";
    case "array": return Array.isArray(value);
    case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
    case "any": return true;
    default: return true;
  }
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return "array";
  return value === null ? "null" : typeof value;
}