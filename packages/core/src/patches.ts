// 生态机制：第三方插件 = npm 包 + `vibepm.bundle.patch` 声明 → 层叠进插件组合。
// 对齐 dsh 的 cordis.patch.yml 行语义（本实现用 JSON，减少依赖）：
//   - 覆盖已有行：`{ "id": "plugin-x", "config": {...} }`（config 整体替换，非 merge）
//   - 插入新行：  `{ "insert": [ { "id": "my-plugin", "name": "@my/pkg", "config": {...} } ] }`
//   - 禁用：      `{ "id": "plugin-y", "disabled": true }`
// 多个 patch 层按 base ← bundles(依赖序) ← profile ← CLI --patch 的顺序层叠，
// 同 id 后层覆盖前层（config 替换整行），insert 追加新 id，disabled 标记跳过。

export interface PatchRow {
  id?: string;
  name?: string;
  config?: Record<string, any>;
  disabled?: boolean;
  /** 一次插入多个新行（仅顶层有值的容器行） */
  insert?: PatchRow[];
}

export interface ResolvedPluginRows {
  order: string[];
  per: Record<string, Record<string, any>>;
  disabled: string[];
}

/** 兼容旧 config-覆盖层（Record<id, config>）→ 转成 patch 行 */
export function configLayerToRows(layer: Record<string, Record<string, any>>): PatchRow[] {
  return Object.entries(layer).map(([id, config]) => ({ id, config }));
}

function normalize(rows: unknown): PatchRow[] {
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === "object") return [rows as PatchRow];
  return [];
}

/**
 * 解析单层 patch 为平铺行（展平 insert 容器）。
 * 输入可以是 JSON 文本、单个行对象或行数组。
 */
export function parsePatchLayer(raw: string | object | unknown[], source = "patch"): PatchRow[] {
  let parsed: unknown;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`vibepm: 解析 patch 层 "${source}" 失败：${(e as Error).message}`);
    }
  } else {
    parsed = raw;
  }
  const out: PatchRow[] = [];
  const walk = (rows: PatchRow[]): void => {
    for (const row of rows) {
      if (row && Array.isArray(row.insert)) {
        walk(normalize(row.insert));
        continue;
      }
      const { insert: _i, ...rest } = row ?? {};
      if (rest.id) out.push(rest);
    }
  };
  walk(normalize(parsed));
  return out;
}

/**
 * 多层 patch 层叠为最终插件行。
 * @param layers 按顺序应用（后层覆盖前层同 id 行）
 * @returns order（首次出现顺序）/ per（每行最终 config，整体替换）/ disabled（禁用 id 列表）
 */
export function resolvePluginRows(layers: readonly (PatchRow[] | string | object)[]): ResolvedPluginRows {
  const order: string[] = [];
  const per: Record<string, Record<string, any>> = {};
  const disabled = new Set<string>();
  for (const layer of layers) {
    const rows = parsePatchLayer(layer as any);
    for (const row of rows) {
      const id = row.id;
      if (!id) continue;
      const known = Object.prototype.hasOwnProperty.call(per, id);
      if (!known) {
        order.push(id);
        per[id] = {};
      }
      // name 仅在首见（insert 新行）时记录；覆盖行不因改名而改变识别
      if (row.name !== undefined && !known) per[id].name = row.name;
      if (row.config !== undefined) {
        // 对齐 dsh：对既有行 config 整体替换，不清掉 name 元数据
        per[id] = { ...per[id], ...row.config };
      }
      if (row.disabled === true) disabled.add(id);
      else if (row.disabled === false) disabled.delete(id);
    }
  }
  return { order, per, disabled: [...disabled] };
}