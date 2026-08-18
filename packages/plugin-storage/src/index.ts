// storage 插件：提供 db 服务 + effect 关库（照 Python storage plugin.py）
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Context } from "@vibepm/core";
import { dbPath as defaultDbPath } from "@vibepm/core";
import { sendJson, readBody, routeCtx, type WebServerService } from "@vibepm/plugin-web-ui";
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
    // 默认 db 路径由本插件持有（内核不写业务默认值）。
    const cfg = { path: defaultDbPath(), ...ctx.mergedConfig("storage"), ...ctx.mergedConfig("plugin-storage") };
    const dbFile = cfg.path ?? defaultDbPath();
    const parent = dirname(dbFile);
    if (parent) mkdirSync(parent, { recursive: true });
    const db = new Database(dbFile);
    const svc = new DatabaseService(db);
    ctx.provide("db", svc);

    // --- db 业务 API（迁自旧 web-ui 路由）：projects / todos / field / sync ---
    // storage 最先加载，webServer 由 web-ui 稍后提供 → 用 onUpdate 等它出现再注册
    const registerApi = (): Array<() => void> => {
      if (!ctx.has("webServer")) return [];
      const ws = ctx.get("webServer") as WebServerService;
      const offs: Array<() => void> = [];
      offs.push(ws.register({ kind: "prefix", path: "/api/projects", handler: (req, res) => {
        const rctx = routeCtx(req, res);
        if (rctx.req.method !== "GET" && rctx.req.method !== "POST") { sendJson(res, 405, { ok: false }); return; }
        if (rctx.path === "/api/projects") { sendJson(res, 200, svc.listProjects()); return; }
        const todoM = rctx.path.match(/^\/api\/projects\/([^/]+)\/todos$/);
        if (todoM) {
          const pid = decodeURIComponent(todoM[1]);
          if (rctx.req.method === "GET") { sendJson(res, 200, svc.listTodos(pid)); return; }
          void (async () => {
            const body = await readBody(rctx.req);
            const id = svc.addTodo(pid, String(body.title ?? ""), String(body.priority ?? "中"));
            sendJson(res, 200, { id });
          })();
          return;
        }
        const fieldM = rctx.path.match(/^\/api\/projects\/([^/]+)\/field$/);
        if (fieldM && rctx.req.method === "POST") {
          const pid = decodeURIComponent(fieldM[1]);
          void (async () => {
            const body = await readBody(rctx.req);
            const p = svc.getProject(pid);
            if (p) {
              const allowed = ["goal", "priority", "status", "tags", "notes"];
              const np: any = { ...p };
              for (const k of Object.keys(body)) if (allowed.includes(k)) np[k] = body[k];
              svc.upsertProject({ ...np, repo_name: np.repo_name });
            }
            sendJson(res, 200, { ok: true });
          })();
          return;
        }
        const projM = rctx.path.match(/^\/api\/projects\/([^/]+)$/);
        if (projM) { sendJson(res, 200, svc.getProject(decodeURIComponent(projM[1]))); return; }
        sendJson(res, 404, { ok: false });
      }}));
      offs.push(ws.register({ kind: "prefix", path: "/api/todos", handler: (req, res) => {
        const rctx = routeCtx(req, res);
        const m = rctx.path.match(/^\/api\/todos\/(\d+)\/done$/);
        if (m && rctx.req.method === "POST") {
          void (async () => {
            const body = await readBody(rctx.req);
            svc.setTodoDone(Number(m[1]), Boolean(body.done));
            sendJson(res, 200, { ok: true });
          })();
          return;
        }
        sendJson(res, 404, { ok: false });
      }}));
      offs.push(ws.register({ kind: "exact", path: "/api/sync", handler: (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { ok: false }); return; }
        // 旧 sync 依赖 repoStore（从未提供）；保留端点，诚实返回未实现
        sendJson(res, 200, { ok: false });
      }}));
      return offs;
    };
    let apiOffs: Array<() => void> = registerApi();
    const onWs = (): void => { if (!apiOffs.length && ctx.has("webServer")) apiOffs = registerApi(); };
    ctx.onUpdate("webServer", onWs);

    return () => {
      ctx.removeUpdate(onWs);
      for (const off of apiOffs.reverse()) try { off(); } catch { /* noop */ }
      try { db.close(); } catch { /* noop */ }
    };
  }
}

// 插件入口：模块导出单插件对象
export const PLUGIN = new StoragePlugin();
