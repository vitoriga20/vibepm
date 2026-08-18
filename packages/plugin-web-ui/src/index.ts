// web-ui 插件 v2：Node http server + 路由分层（/api/*、/plugins/*、/ 壳）+ 同步 bind + port=0 + 优雅关闭
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import type { Context, SlotService, ClientModuleHost } from "@vibepm/core";

export const PLUGIN_NAME = "plugin-web-ui";

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

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const c of req as any) chunks.push(Buffer.from(c as any));
  try { return JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { return {}; }
}

export { sendJson, readBody };

export interface ApiRouteCtx {
  req: IncomingMessage;
  res: ServerResponse;
  path: string;
  url: URL;
}

/** 路由分发器 */
async function router(req: IncomingMessage, res: ServerResponse, staticDir: string, ctx: Context): Promise<void> {
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.pathname;
  const slots = ctx.has("slots") ? ctx.get("slots") as SlotService : null;
  const boot = ctx.has("bootGraph") ? ctx.get("bootGraph") as ClientModuleHost : null;
  const db = ctx.has("db") ? ctx.get("db") as any : null;

  // 扩展路由：事件 "web-api/route" —— 返回 true 表示该插件已接管（已经 end 响应）
  // 这样其他插件 inject webApp 即可通过 ctx.on("web-api/route", handler) 自注册 API
  const taken = ctx.bail("web-api/route", { req, res, path, url });
  if (taken === true) return;

  // --- /api/slots: slots snapshot ---
  if (path === "/api/slots") { sendJson(res, 200, slots?.snapshot() ?? {}); return; }
  // --- /api/boot: bootGraph ---
  if (path === "/api/boot") { sendJson(res, 200, boot?.graph() ?? { rev: "0", entries: [] }); return; }
  // --- /api/health ---
  if (path === "/api/health") { sendJson(res, 200, { ok: true }); return; }

  // --- Projects / Todos APIs（保留现有业务 API，过渡）---
  if (path === "/api/projects") { sendJson(res, 200, db ? db.listProjects() : []); return; }
  const projMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projMatch) { sendJson(res, 200, db ? db.getProject(decodeURIComponent(projMatch[1])) : null); return; }
  const todoListMatch = path.match(/^\/api\/projects\/([^/]+)\/todos$/);
  if (todoListMatch && req.method === "GET") { sendJson(res, 200, db ? db.listTodos(decodeURIComponent(todoListMatch[1])) : []); return; }
  if (todoListMatch && req.method === "POST") {
    const body = await readBody(req);
    const id = db ? db.addTodo(decodeURIComponent(todoListMatch[1]), body.title ?? "", body.priority ?? "中") : null;
    sendJson(res, 200, { id });
    return;
  }
  const doneMatch = path.match(/^\/api\/todos\/(\d+)\/done$/);
  if (doneMatch && req.method === "POST") {
    const body = await readBody(req);
    if (db) db.setTodoDone(Number(doneMatch[1]), Boolean(body.done));
    sendJson(res, 200, { ok: true });
    return;
  }
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
    const m = path.match(/^\/api\/projects\/([^/]+)\/field$/);
    if (m && db) {
      const body = await readBody(req);
      const p = db.getProject(decodeURIComponent(m[1]));
      if (p) {
        const allowed = ["goal", "priority", "status", "tags", "notes"];
        const np: any = { ...p };
        for (const k of Object.keys(body)) if (allowed.includes(k)) np[k] = body[k];
        db.upsertProject({ ...np, repo_name: np.repo_name });
      }
      sendJson(res, 200, { ok: true });
      return;
    }
  }
  // --- client bundles: /plugins/<id>/** 任意相对 client 目录的文件（含 client.js → 入口别名）---
  const pluginsAny = path.match(/^\/plugins\/([^/]+)\/(.+)$/);
  if (pluginsAny && boot) {
    const served = boot.serve(pluginsAny[1], decodeURIComponent(pluginsAny[2]));
    if (served) { res.writeHead(200, { "Content-Type": served.contentType + "; charset=utf-8" }); res.end(served.bytes); return; }
  }
  // --- 静态前端壳（index.html + style.css + shell.js）---
  const clean = path.startsWith("/static/") ? path.slice("/static/".length) : path.slice(1);
  const file = path === "/" || path === "" || clean === "" ? "index.html" : clean;
  const full = join(staticDir, file);
  if (!existsSync(full) || !full.startsWith(staticDir)) { res.statusCode = 404; res.end("Not Found"); return; }
  const ext = file.split(".").pop() ?? "html";
  // index.html 要做模板化注入：__VIBEPM_BOOT__ / __VIBEPM_SLOTS__
  if (ext === "html") {
    let html = readFileSync(full, "utf-8");
    if (boot) html = html.replace("/*__BOOT__*/", `window.__VIBEPM_BOOT__ = ${JSON.stringify(boot.graph())};`);
    if (slots) html = html.replace("/*__SLOTS__*/", `window.__VIBEPM_SLOTS__ = ${JSON.stringify(slots.snapshot())};`);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  const type = ext === "js" ? "application/javascript" : ext === "css" ? "text/css" : ext === "svg" ? "image/svg+xml" : "text/plain";
  res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
  res.end(readFileSync(full));
}

class WebUiPlugin {
  name = PLUGIN_NAME;
  provide = ["webApp", "webUrl"];
  inject = ["db", "slots", "bootGraph"];

  apply(ctx: Context): () => void {
    const staticDir = resolveStaticDir();
    // 配置规范键为短名（web_ui），loader 内部按 entry id（plugin-web-ui）记录；
    // 合并两层：以短名为基，entry-id 层若覆盖则优先生效，避免空对象短路 misses。
    const cfg = { host: "127.0.0.1", port: 8080, open_browser: true, ...ctx.mergedConfig("web_ui"), ...ctx.mergedConfig("plugin-web-ui") };
    const host = cfg.host ?? "127.0.0.1";
    const port = Number(cfg.port ?? 0);
    const openBrowser = Boolean(cfg.open_browser ?? true);

    const server = createServer((req, res) => void router(req, res, staticDir, ctx));
    let bound = false;
    let closed = false;

    server.once("listening", () => {
      const actualPort = (server.address() as { port: number }).port;
      const url = `http://${host}:${actualPort}`;
      ctx.provide("webApp", new WebApp(server));
      ctx.provide("webUrl", new WebUrl(url));
      process.stdout.write(`vibepm web: ${url}\n`);
      if (openBrowser) void webopen(url);
    });

    server.on("error", (err: any) => {
      if (err && err.code === "EADDRINUSE") {
        ctx.bootErrors.push(new PortBusyError(host, port, err));
      }
    });

    server.once("tlsClientError", () => {});

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
  // 本文件位于 packages/plugin-web-ui/dist/index.js；静态壳在 packages/plugin-web-ui/static
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "static");
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

export const PLUGIN = new WebUiPlugin();
