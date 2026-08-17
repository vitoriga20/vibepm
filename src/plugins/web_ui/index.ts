// web-ui 插件：node:http 本地服务 + 静态前端（同步 bind / port=0 / 就绪行 / 优雅关闭）
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "../../core/context.js";

export const PLUGIN_NAME = "web-ui";

export class PortBusyError extends Error {
  constructor(host: string, port: number, cause: unknown) {
    super(`端口 ${host}:${port} 绑定失败（${String(cause)}）。可能已有进程占用，或改用 0 让系统自动分配(web_ui.port=0)。`);
    this.name = "PortBusyError";
  }
}

export class WebApp {
  name = "webApp";
  constructor(readonly server: Server) {}
}

export class WebUrl {
  name = "webUrl";
  constructor(readonly url: string) {}
  toString(): string { return this.url; }
}

const router = async (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, staticDir: string, ctx: Context): Promise<void> => {
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.pathname;
  // ---- REST API ----
  if (path === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (path === "/api/projects") {
    const db = ctx.has("db") ? ctx.get("db") as any : null;
    sendJson(res, 200, db ? db.listProjects() : []);
    return;
  }
  const projMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projMatch) {
    const db = ctx.has("db") ? ctx.get("db") as any : null;
    sendJson(res, 200, db ? db.getProject(decodeURIComponent(projMatch[1])) : null);
    return;
  }
  // 项目 todos 列表
  const todoListMatch = path.match(/^\/api\/projects\/([^/]+)\/todos$/);
  if (todoListMatch && req.method === "GET") {
    const db = ctx.has("db") ? ctx.get("db") as any : null;
    sendJson(res, 200, db ? db.listTodos(decodeURIComponent(todoListMatch[1])) : []);
    return;
  }
  // 新增 todo
  if (todoListMatch && req.method === "POST") {
    const db = ctx.has("db") ? ctx.get("db") as any : null;
    const body = await readBody(req);
    const id = db ? db.addTodo(decodeURIComponent(todoListMatch[1]), body.title ?? "", body.priority ?? "中") : null;
    sendJson(res, 200, { id });
    return;
  }
  // 勾选 done
  const doneMatch = path.match(/^\/api\/todos\/(\d+)\/done$/);
  if (doneMatch && req.method === "POST") {
    const db = ctx.has("db") ? ctx.get("db") as any : null;
    const body = await readBody(req);
    if (db) db.setTodoDone(Number(doneMatch[1]), Boolean(body.done));
    sendJson(res, 200, { ok: true });
    return;
  }
  // 手动同步
  if (path === "/api/sync" && req.method === "POST") {
    if (ctx.has("repoStore")) {
      const store = ctx.get("repoStore") as any;
      const github = ctx.config.github ?? {};
      if (!github.token || !github.owner) { sendJson(res, 200, { ok: false, reason: "not_connected" }); return; }
      await store.sync();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 200, { ok: false });
    return;
  }
  if (path.endsWith("/field") && req.method === "POST") {
    // 更新本地字段（白名单）
    const m = path.match(/^\/api\/projects\/([^/]+)\/field$/);
    if (m && ctx.has("db")) {
      const db = ctx.get("db") as any;
      const body = await readBody(req);
      const p = db.getProject(decodeURIComponent(m[1]));
      const allowed = ["goal", "priority", "status", "tags", "notes"];
      for (const k of Object.keys(body)) {
        if (allowed.includes(k)) p[k] = body[k];
      }
      db.upsertProject({ ...p, repo_name: p.repo_name });
      sendJson(res, 200, { ok: true });
      return;
    }
  }
  if (path.startsWith("/api/auth/")) {
    handleAuth(path, req, res, ctx);
    return;
  }
  // ---- 静态前端 ----
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const clean = path.startsWith("/static/") ? path.slice("/static/".length) : path.slice(1);
  const file = path === "/" || path === "" || clean === "" ? "index.html" : clean;
  const full = join(staticDir, file);
  if (!existsSync(full) || !full.startsWith(staticDir)) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }
  const ext = file.split(".").pop() ?? "html";
  const type = ext === "js" ? "application/javascript" : ext === "css" ? "text/css" : "text/html";
  res.writeHead(200, { "Content-Type": type });
  res.end(readFileSync(full));
};

class WebUiPlugin {
  name = PLUGIN_NAME;
  provide = ["webApp", "webUrl"];
  inject = ["db"];

  apply(ctx: Context): () => void {
    const staticDir = resolveStaticDir();
    const cfg = ctx.mergedConfig("web_ui");
    const host = cfg.host ?? "127.0.0.1";
    const port = Number(cfg.port ?? 8080);
    const openBrowser = Boolean(cfg.open_browser ?? true);

    const server = createServer((req, res) => void router(req, res, staticDir, ctx));
    let bound = false;
    let closed = false;

    server.once("listening", () => {
      const actualPort = (server.address() as { port: number }).port;
      const url = `http://${host}:${actualPort}`;
      ctx.provide("webApp", new WebApp(server));
      ctx.provide("webUrl", new WebUrl(url));
      // 就绪行（URL 行即就绪信号）
      process.stdout.write(`vibepm web: ${url}\n`);
      if (openBrowser) void webopen(url);
    });

    server.on("error", (err: any) => {
      if (err && err.code === "EADDRINUSE") {
        ctx.bootErrors.push(new PortBusyError(host, port, err));
      }
    });

    server.once("tlsClientError", () => {}); // 占位避免未捕获

    try {
      server.listen(port, host);
      bound = true;
    } catch (err) {
      ctx.bootErrors.push(new PortBusyError(host, port, err));
      throw new PortBusyError(host, port, err);
    }

    return () => {
      if (closed) return;
      closed = true;
      try { server.close(); } catch { /* noop */ }
      if (ctx.has("webApp")) ctx.unprovide("webApp");
      if (ctx.has("webUrl")) ctx.unprovide("webUrl");
    };
  }
}

function resolveStaticDir(): string {
  // 本文件位于 dist/plugins/web_ui/index.js（或 src/...）；前端打包到 {root}/static
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "static");
}

async function webopen(url: string): Promise<void> {
  try {
    const mod = await import("node:child_process");
    const { exec } = mod;
    if (process.platform === "win32") exec(`start "" "${url}"`);
    else if (process.platform === "darwin") exec(`open "${url}"`);
    else exec(`xdg-open "${url}"`);
  } catch { /* noop */ }
}

function sendJson(res: import("node:http").ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  try { return JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { return {}; }
}

async function handleAuth(path: string, req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, ctx: Context): Promise<void> {
  const github = ctx.config.github ?? {};
  if (path === "/api/auth/status") {
    sendJson(res, 200, { connected: Boolean(github.token), owner: github.owner ?? "" });
    return;
  }
  try {
    const { startDeviceFlow, pollToken } = await import("../github_source/gh.js");
    if (path === "/api/auth/device" && req.method === "POST") {
      const flow = await startDeviceFlow();
      sendJson(res, 200, { state: "pending", user_code: flow.user_code, verification_uri: flow.verification_uri, interval: flow.interval, expires_in: flow.expires_in });
      return;
    }
    if (path === "/api/auth/device/poll" && req.method === "POST") {
      const body = await readBody(req);
      const token = await pollToken(body.device_code);
      if (!token) { sendJson(res, 200, { state: "pending" }); return; }
      const loader = ctx.loader as any;
      if (loader?.save_runtime) loader.save_runtime(ctx, "github", { token });
      sendJson(res, 200, { state: "ok" });
      return;
    }
  } catch (e) {
    sendJson(res, 500, { state: "error", message: String(e) });
    return;
  }
  sendJson(res, 404, { state: "none" });
}

export const PLUGIN = new WebUiPlugin();