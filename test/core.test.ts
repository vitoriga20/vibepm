import { test } from "node:test";
import assert from "node:assert/strict";
import { Context, Disposable, effect, collect } from "../src/core/index.ts";

test("Disposable 逆序清理", () => {
  const order: string[] = [];
  const d = new Disposable("t");
  d.register(() => order.push("a"));
  d.register(() => order.push("b"));
  d.dispose();
  assert.deepEqual(order, ["b", "a"]);
  assert.equal(d.disposed, true);
});

test("Disposable 双重 dispose 幂等", () => {
  let n = 0;
  const d = new Disposable();
  d.register(() => n++);
  d.dispose();
  d.dispose();
  assert.equal(n, 1);
});

test("effect 收集 execute 返回 disposer", () => {
  const order: string[] = [];
  const d = effect(() => () => order.push("closed"));
  d.dispose();
  assert.deepEqual(order, ["closed"]);
});

test("collect 聚合多 disposer", () => {
  let n = 0;
  const a = new Disposable();
  a.register(() => n++);
  const c = collect(a);
  c.dispose();
  assert.equal(n, 1);
});

test("Context provide/get/has", () => {
  const ctx = new Context();
  ctx.provide("db", { hello: 1 });
  assert.equal(ctx.has("db"), true);
  assert.equal((ctx.get("db") as any).hello, 1);
  ctx.unprovide("db");
  assert.equal(ctx.has("db"), false);
});

test("Context event emit", () => {
  const ctx = new Context();
  const seen: number[] = [];
  ctx.on("x", () => seen.push(1));
  ctx.on("x", () => seen.push(2));
  ctx.emit("x");
  assert.deepEqual(seen, [1, 2]);
});

test("插件反应式：依赖就绪才激活", () => {
  const ctx = new Context();
  let activated = false;
  ctx.plugin(
    { name: "p", inject: ["db"], apply: () => { activated = true; return () => undefined; } },
    {},
  );
  assert.equal(activated, false); // 依赖缺失
  ctx.provide("db", {});
  assert.equal(activated, true);
});

test("插件 dispose 触发 effect 清理", () => {
  const ctx = new Context();
  let closed = false;
  ctx.provide("db", {});
  const fiber = ctx.plugin(
    { name: "p", inject: ["db"], apply: (c: Context) => { c.on("ev", () => {}); return () => { closed = true; }; } },
    {},
  );
  assert.equal(closed, false);
  ctx.dispose();
  assert.equal(closed, true);
});