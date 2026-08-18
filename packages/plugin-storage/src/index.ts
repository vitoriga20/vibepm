// storage 插件：提供 db 服务 + effect 关库（照 Python storage plugin.py）
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Context } from "@vibepm/core";
import { Database, type ProjectRow, type TodoRow } from "./db.js";

export { Database } from "./db.js";
export type { ProjectRow, TodoRow } from "./db.js";

// db 服务：包装 Database，暴露方法
export class DatabaseService {
  name = "db";
  constructor(private db: Database) {}

  listTables(): Set<string> { return this.db.listTables(); }
  upsertProject(row: Partial<ProjectRow> & { repo_name: string }): void { this.db.upsertProject(row); }
  getProject(repo: string): ProjectRow | null { return this.db.getProject(repo); }
  listProjects(): ProjectRow[] { return this.db.listProjects(); }
  addTodo(pid: string, title: string, priority = "中"): number { return this.db.addTodo(pid, title, priority); }
  setTodoDone(tid: number, done: boolean): void { this.db.setTodoDone(tid, done); }
  listTodos(pid: string): TodoRow[] { return this.db.listTodos(pid); }
  recordSync(repo: string, at: string, act = ""): void { this.db.recordSync(repo, at, act); }
  lastSync(repo: string): string | null { return this.db.lastSync(repo); }
  getSetting<T = unknown>(key: string): T | null { return this.db.getSetting(key); }
  setSetting<T = unknown>(key: string, value: T): void { this.db.setSetting(key, value); }
  listSettings(): Record<string, unknown> { return this.db.listSettings(); }
  deleteSetting(key: string): void { this.db.deleteSetting(key); }
  close(): void { this.db.close(); }
}

class StoragePlugin {
  name = "plugin-storage";
  provide = ["db"];

  apply(ctx: Context): () => void {
    // 配置规范键为短名（storage），loader 内部按 entry id（plugin-storage）记录；
    // 合并两层：以短名为基，entry-id 层若覆盖则优先生效，避免空对象短路 misses。
    const cfg = { ...ctx.mergedConfig("storage"), ...ctx.mergedConfig("plugin-storage") };
    let dbPath = cfg.path ?? "vibepm.db";
    const parent = dirname(dbPath);
    if (parent) mkdirSync(parent, { recursive: true });
    const db = new Database(dbPath);
    const svc = new DatabaseService(db);
    ctx.provide("db", svc);
    return () => { try { db.close(); } catch { /* noop */ } };
  }
}

// 插件入口：模块导出单插件对象
export const PLUGIN = new StoragePlugin();
