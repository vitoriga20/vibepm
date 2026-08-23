// web-ui 插件 v3：webServer 哑载体（对齐 dsh-host-webserver）
// - webServer 服务：register(route)（exact/prefix 命名路由）/ registerFallback（唯一兜底座位）/ tapIndex（纯 html 变换）
// - 路由匹配：exact 表 → 最长 prefix（p 与 p/<anything>）→ fallback（静态壳，SPA 语义）
// - 业务 API 不属于本插件：各业务插件（storage/github-auth/repo-feed/settings/plugin-manager）
//   自己 register 到 webServer；本插件只做传输载体 + 静态壳 + boot/slots 注入。
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import type { Context, SlotService, ClientModuleHost } from "@vitoriga20/core";
import { BootError } from "@vitoriga20/core";

export const PLUGIN_NAME = "plugin-web-ui";

export class PortBusyError extends BootError {
  constructor(host: string, port: number, cause: unknown) {
    super("web.listen_failed", `端口 ${host}:${port} 绑定失败（${String(cause)}）。可能已有进程占用，或改用 0 让系统自动分配(web_ui.port=0)。`);
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

/** 由 req/res 构造路由上下文（path 解码后路径名 + url） */
export function routeCtx(req: IncomingMessage, res: ServerResponse): ApiRouteCtx {
  const url = new URL(req.url ?? "/", "http://local");
  return { req, res, path: url.pathname, url };
}

export type WebRouteKind = "exact" | "prefix";
export interface WebRoute {
  /** exact 精确匹配 pathname；prefix 匹配 p 与 p/<anything> */
  kind: WebRouteKind;
  /** 绝对 pathname，无尾斜杠 */
  path: string;
  /** 全权负责响应生命周期（可挂起 SSE） */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}

type WebRouteHandler = WebRoute["handler"];

/**
 * webServer 哑载体：命名路由 + 唯一兜底座位 + index 变换。
 * 不认识任何业务概念；业务路由由各插件 register 上来。
 */
export class WebServerService {
  name = "webServer";
  private _routes: WebRoute[] = [];
  private _fallback: WebRouteHandler | null = null;
  private _taps: Array<(html: string) => string> = [];

  register(route: WebRoute): () => void {
    if (this._routes.some((r) => r.kind === route.kind && r.path === route.path)) {
      throw new Error(`webServer: duplicate route ${route.kind} ${route.path}`);
    }
    this._routes.push(route);
    return () => { this._routes = this._routes.filter((r) => r !== route); };
  }

  /** 认领兜底座位：一个 owner，重复注册抛错 */
  registerFallback(handler: WebRouteHandler): () => void {
    if (this._fallback) throw new Error("webServer: fallback seat already claimed");
    this._fallback = handler;
    return () => { if (this._fallback === handler) this._fallback = null; };
  }

  /** 注册 index.html 变换，按注册序应用于每个 index 响应 */
  tapIndex(transform: (html: string) => string): () => void {
    this._taps.push(transform);
    return () => { this._taps = this._taps.filter((t) => t !== transform); };
  }

  applyIndexTaps(html: string): string {
    let out = html;
    for (const t of this._taps) out = t(out);
    return out;
  }

  /** 分发一次请求：exact 表 → 最长 prefix → fallback。返回是否已接管响应。 */
  async dispatch(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? "/", "http://local").pathname;
    for (const r of this._routes) {
      if (r.kind === "exact" && r.path === path) {
        await r.handler(req, res);
        return true;
      }
    }
    let best: WebRoute | null = null;
    let bestLen = -1;
    for (const r of this._routes) {
      if (r.kind !== "prefix") continue;
      const hit = path === r.path || path.startsWith(r.path + "/");
      if (hit && r.path.length > bestLen) { best = r; bestLen = r.path.length; }
    }
    if (best) {
      await best.handler(req, res);
      return true;
    }
    if (this._fallback) {
      await this._fallback(req, res);
      return true;
    }
    return false;
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

/** 静态壳兜底（对齐 dsh-host-frontend-static）：越界 403、miss→index.html 200（SPA）、非 GET/HEAD 405 */
async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  staticDir: string,
  renderIndex: () => Promise<string>,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
  const pathname = new URL(req.url ?? "/", "http://local").pathname;
  const rel = pathname.startsWith("/static/") ? pathname.slice("/static/".length) : pathname.slice(1);
  const isIndex = rel === "" || rel === "index.html";
  const full = isIndex ? join(staticDir, "index.html") : resolve(staticDir, rel);
  // 目录穿越保护
  if (full !== staticDir && !full.startsWith(normalize(staticDir) + sep)) { res.writeHead(403); res.end(); return; }
  if (isIndex) {
    const body = await renderIndex();
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(body);
    return;
  }
  try {
    const body = readFileSync(full);
    const dot = full.lastIndexOf(".");
    const ext = dot >= 0 ? full.slice(dot).toLowerCase() : "";
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    // miss → SPA 回退 index.html（200）
    const body = await renderIndex();
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(body);
  }
}

class WebUiPlugin {
  name = PLUGIN_NAME;
  provide = ["webServer", "webApp", "webUrl"];
  inject = ["slots", "bootGraph"];

  apply(ctx: Context): () => void {
    const staticDir = resolveStaticDir();
    // 配置规范键为短名（web_ui），loader 内部按 entry id（plugin-web-ui）记录；
    // 合并两层：以短名为基，entry-id 层若覆盖则优先生效，避免空对象短路 misses。
    // 默认 host/port/open_browser 由本插件持有（内核不写业务默认值）。
    const cfg = { host: "127.0.0.1", port: 8080, open_browser: true, ...ctx.mergedConfig("web_ui"), ...ctx.mergedConfig("plugin-web-ui") };
    const host = cfg.host ?? "127.0.0.1";
    const port = Number(cfg.port ?? 0);
    const openBrowser = Boolean(cfg.open_browser ?? true);

    const ws = new WebServerService();
    const disposers: Array<() => void> = [];

    // --- 通用框架路由（非业务，属传输层自有）---
    disposers.push(ws.register({ kind: "exact", path: "/api/health", handler: (_req, res) => sendJson(res, 200, { ok: true }) }));
    disposers.push(ws.register({
      kind: "exact",
      path: "/api/slots",
      handler: (_req, res) => {
        const slots = ctx.has("slots") ? ctx.get("slots") as SlotService : null;
        sendJson(res, 200, slots?.snapshot() ?? {});
      },
    }));
    disposers.push(ws.register({
      kind: "exact",
      path: "/api/boot",
      handler: (_req, res) => {
        const boot = ctx.has("bootGraph") ? ctx.get("bootGraph") as ClientModuleHost : null;
        sendJson(res, 200, boot?.graph() ?? { rev: "0", entries: [] });
      },
    }));
    // --- /plugins/<id>/** client bundles（传输层 glue，分发到 ClientModuleHost）---
    disposers.push(ws.register({
      kind: "prefix",
      path: "/plugins",
      handler: (req, res) => {
        const boot = ctx.has("bootGraph") ? ctx.get("bootGraph") as ClientModuleHost : null;
        const url = new URL(req.url ?? "/", "http://local");
        const m = url.pathname.match(/^\/plugins\/([^/]+)\/(.+)$/);
        if (!m || !boot) { res.writeHead(404); res.end("Not Found"); return; }
        const served = boot.serve(m[1], decodeURIComponent(m[2]));
        if (!served) { res.writeHead(404); res.end("Not Found"); return; }
        res.writeHead(200, { "Content-Type": served.contentType + "; charset=utf-8" });
        res.end(served.bytes);
      },
    }));
    // --- index 变换：boot / slots 注入（纯 html→html）---
    disposers.push(ws.tapIndex((html) => {
      const boot = ctx.has("bootGraph") ? ctx.get("bootGraph") as ClientModuleHost : null;
      return html.replace("/*__BOOT__*/", boot ? `window.__VIBEPM_BOOT__ = ${JSON.stringify(boot.graph())};` : "");
    }));
    disposers.push(ws.tapIndex((html) => {
      const slots = ctx.has("slots") ? ctx.get("slots") as SlotService : null;
      return html.replace("/*__SLOTS__*/", slots ? `window.__VIBEPM_SLOTS__ = ${JSON.stringify(slots.snapshot())};` : "");
    }));
    // --- 静态壳兜底（占 fallback 座位）---
    const renderIndex = async (): Promise<string> =>
      ws.applyIndexTaps(readFileSync(join(staticDir, "index.html"), "utf-8"));
    disposers.push(ws.registerFallback((req, res) => serveStatic(req, res, staticDir, renderIndex)));

    // 立即提供 webServer（业务插件注入它来注册 API 路由）
    ctx.provide("webServer", ws);

    const server = createServer((req, res) => {
      void ws.dispatch(req, res).then((taken) => {
        if (!taken) { res.writeHead(404); res.end("Not Found"); }
      }).catch(() => {
        try { res.writeHead(500); res.end("Internal Server Error"); } catch { res.destroy(); }
      });
    });
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
    } catch (err) {
      ctx.bootErrors.push(new PortBusyError(host, port, err));
      throw new PortBusyError(host, port, err);
    }

    return () => {
      if (closed) return;
      closed = true;
      try { server.close(); } catch { /* noop */ }
      for (const off of disposers.reverse()) try { off(); } catch { /* noop */ }
      if (ctx.has("webApp")) ctx.unprovide("webApp");
      if (ctx.has("webUrl")) ctx.unprovide("webUrl");
      if (ctx.has("webServer")) ctx.unprovide("webServer");
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
    // execFile 免 shell 直传参数：url 即使含元字符也无注入面（exec 拼串会被扫命令注入）
    const { execFile } = mod;
    if (process.platform === "win32") execFile("cmd", ["/c", "start", "", url]);
    else if (process.platform === "darwin") execFile("open", [url]);
    else execFile("xdg-open", [url]);
  } catch { /* noop */ }
}

export const PLUGIN = new WebUiPlugin();
