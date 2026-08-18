// patches.ts + schema.ts 语义测试（node:test + tsx，PNPM 用 pnpm test 跑）
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  parsePatchLayer,
  resolvePluginRows,
  configLayerToRows,
  type PatchRow,
} from "../src/patches.js";
import { validatePluginConfig } from "../src/schema.js";

const base: PatchRow[] = [
  { id: "a", name: "@vibepm/a" },
  { id: "b", name: "@vibepm/b" },
];

test("resolvePluginRows: base 顺序保留", () => {
  const r = resolvePluginRows([base]);
  assert.deepEqual(r.order, ["a", "b"]);
  assert.deepEqual(r.disabled, []);
});

test("resolvePluginRows: 覆盖行整体替换 config", () => {
  const r = resolvePluginRows([
    base,
    [{ id: "a", config: { v: 1 } }],
    [{ id: "a", config: { v: 2, k: true } }],
  ]);
  assert.deepEqual(r.per.a, { v: 2, k: true, name: "@vibepm/a" });
  assert.deepEqual(r.order, ["a", "b"], "覆盖不改变顺序");
});

test("resolvePluginRows: insert 追加新行", () => {
  const r = resolvePluginRows([
    base,
    [{ insert: [{ id: "c", name: "@vibepm/c", config: { x: 1 } }] }],
  ]);
  assert.deepEqual(r.order, ["a", "b", "c"]);
  assert.deepEqual(r.per.c, { x: 1, name: "@vibepm/c" });
});

test("resolvePluginRows: disabled 标记与再启用", () => {
  const r = resolvePluginRows([base, [{ id: "b", disabled: true }]]);
  assert.deepEqual(r.disabled, ["b"]);
  const r2 = resolvePluginRows([base, [{ id: "b", disabled: true }], [{ id: "b", disabled: false }]]);
  assert.deepEqual(r2.disabled, []);
});

test("parsePatchLayer: JSON 文本 + 展平 insert", () => {
  const rows = parsePatchLayer(`[ {"insert":[{"id":"x","config":{}}]}, {"id":"y","disabled":true} ]`);
  assert.deepEqual(rows.map((r) => r.id), ["x", "y"]);
});

test("configLayerToRows: 旧 config 覆盖层 → 行", () => {
  const rows = configLayerToRows({ "plugin-web-ui": { port: 0 } });
  assert.deepEqual(rows, [{ id: "plugin-web-ui", config: { port: 0 } }]);
});

test("validatePluginConfig: 必填缺字段报错", () => {
  const err = validatePluginConfig("p", { a: 1 }, { b: { type: "string", required: true } });
  assert.match(String(err), /b/);
  assert.equal(validatePluginConfig("p", { a: 1, b: "s" }, { b: { type: "string", required: true } }), null);
});

test("validatePluginConfig: 类型不匹配报错", () => {
  const err = validatePluginConfig("p", { n: "not-a-number" }, { n: { type: "number" } });
  assert.match(String(err), /n/);
  assert.equal(validatePluginConfig("p", { n: 3 }, { n: { type: "number" } }), null);
});