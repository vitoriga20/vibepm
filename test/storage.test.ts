import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { Database } from "../src/plugins/storage/db.ts";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "vibepm-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

test("建表", () => {
  const db = new Database(join(dir, "t.db"));
  const tables = db.listTables();
  assert.ok(tables.has("projects"));
  assert.ok(tables.has("todos"));
  assert.ok(tables.has("sync_state"));
  db.close();
});

test("upsert/get project", () => {
  const db = new Database(join(dir, "t.db"));
  db.upsertProject({ repo_name: "demo", goal: "做一个工具", commits_30d: 5 });
  const p = db.getProject("demo");
  assert.equal(p?.repo_name, "demo");
  assert.equal(p?.goal, "做一个工具");
  assert.equal(p?.commits_30d, 5);
  db.close();
});

test("todo crud", () => {
  const db = new Database(join(dir, "t.db"));
  const id = db.addTodo("demo", "写 README", "中");
  db.setTodoDone(id, true);
  const todos = db.listTodos("demo");
  assert.equal(todos[0].done, 1);
  assert.equal(todos[0].title, "写 README");
  db.close();
});

test("sync state", () => {
  const db = new Database(join(dir, "t.db"));
  db.recordSync("demo", "2026-08-01T10:00:00Z", "2026-08-01T09:00:00Z");
  assert.equal(db.lastSync("demo"), "2026-08-01T10:00:00Z");
  db.close();
});