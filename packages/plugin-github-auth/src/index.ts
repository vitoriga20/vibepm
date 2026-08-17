/**
 * plugin-github-auth
 *
 * 功能 (对齐 MVP scope)：
 *  1) 设置面板（route=#auth）：填 GitHub username + Personal Access Token
 *  2) 存 settings: github.username / github.token（token 不返 API，仅存本地）
 *  3) 暴露 `github` service：
 *     - me(): Promise<{ login, name, avatar_url } | null>   (token + username 校验用 GET /user)
 *     - fetchJson(path, { method, body, timeout }): 通用 GET/POST github rest API
 *  4) HTTP 路由:
 *     - GET  /api/github/status → { ok, username, scopes? }
 *     - POST /api/github/login  { username, token, api_base? } → { ok, me }
 *     - POST /api/github/logout → { ok }
 *     - GET  /api/github/proxy/:path → 透传 /user, /user/repos, /users/:u/received_events 等（用 cookie / session-less，即 settings.token）
 *
 * 注意：MVP 直接用 settings 表存 token（明文本地 SQLite，dsh 风格「本地优先、够用」）；
 *       以后想加密可以只改 github service 的读写位置、无需改面板。
 */
import type { Context } from "@vibepm/core";
import { readBody, sendJson, type ApiRouteCtx } from "@vibepm/plugin-web-ui";
import type { SlotName, SlotService } from "@vibepm/plugin-ide-view";

type DbLike = {
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

export type GhUser = { login: string; name?: string; avatar_url?: string };

export class GitHubService {
  name = "github";
  constructor(
    private readonly db: DbLike,
    private readonly apiBase = "https://api.github.com",
  ) {}

  token(): string | null { return this.db.getSetting<string>("github.token"); }
  username(): string | null { return this.db.getSetting<string>("github.username"); }
  apiBaseOverride(): string { return this.db.getSetting<string>("github.api_base") ?? this.apiBase; }

  async fetchJson(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<any> {
    const token = this.token();
    if (!token) throw Object.assign(new Error("未连接 GitHub"), { code: "NO_TOKEN" });
    const base = this.apiBaseOverride();
    const url = /^https?:/.test(path) ? path : base + (path.startsWith("/") ? "" : "/") + path;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
    try {
      const r = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "vibepm",
          ...(opts.body ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      const text = await r.text();
      let json: any; try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
      if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status}: ${json?.message ?? r.statusText}`), { code: "GH_" + r.status, json });
      return json;
    } finally { clearTimeout(timer); }
  }

  async me(): Promise<GhUser | null> {
    try { return (await this.fetchJson("/user")) as GhUser; }
    catch (e) {
      if ((e as any).code === "NO_TOKEN") return null;
      throw e;
    }
  }
}

class GithubAuthPlugin {
  name = "plugin-github-auth";
  provide = ["github"];
  inject = ["db", "slots"] as const;

  apply(ctx: Context): () => void {
    const db = ctx.get("db") as any;
    const slots = ctx.get("slots") as any;
    const disposers: Array<() => void> = [];

    // 允许配置 api_base（config 优先；无则 settings 里允许覆盖）
    const cfg = (ctx.mergedConfig("plugin-github-auth") ?? {}) as { api_base?: string };
    const service = new GitHubService(db as DbLike, cfg.api_base ?? "https://api.github.com");
    ctx.provide("github", service);

    // --- API ---
    // 注：web-api/route 是 bail 事件，listener 必须同步；异步工作用 IIFE + sync return true。
    const offRoute = ctx.on("web-api/route", (rctx: ApiRouteCtx): boolean | undefined => {
      if (!rctx.path.startsWith("/api/github")) return;
      const sub = rctx.path.slice("/api/github".length) || "/";

      if ((sub === "/status" || sub === "/status/") && rctx.req.method === "GET") {
        const u = service.username();
        const tok = service.token();
        if (!u || !tok) { sendJson(rctx.res, 200, { ok: false, connected: false }); return true; }
        void (async () => {
          try {
            const me = await service.me();
            sendJson(rctx.res, 200, { ok: true, connected: true, username: u, me: me ?? null });
          } catch (e) {
            sendJson(rctx.res, 200, { ok: false, connected: false, reason: (e as Error).message });
          }
        })();
        return true;
      }
      if ((sub === "/login" || sub === "/login/") && rctx.req.method === "POST") {
        void (async () => {
          try {
            const body = await readBody(rctx.req);
            const username = String(body.username ?? "").trim();
            const token = String(body.token ?? "").trim();
            const apiBase = body.api_base ? String(body.api_base).trim() : undefined;
            if (!username || !token) { sendJson(rctx.res, 400, { ok: false, reason: "需要 username + token" }); return; }
            db.setSetting("github.username", username);
            db.setSetting("github.token", token);
            if (apiBase) db.setSetting("github.api_base", apiBase);
            else db.deleteSetting("github.api_base");
            try {
              const me = await service.me();
              sendJson(rctx.res, 200, { ok: true, me });
            } catch (e) {
              sendJson(rctx.res, 200, { ok: false, reason: (e as Error).message });
            }
          } catch (e) {
            sendJson(rctx.res, 500, { ok: false, reason: (e as Error).message });
          }
        })();
        return true;
      }
      if ((sub === "/logout" || sub === "/logout/") && rctx.req.method === "POST") {
        db.deleteSetting("github.token");
        db.deleteSetting("github.username");
        db.deleteSetting("github.api_base");
        sendJson(rctx.res, 200, { ok: true });
        return true;
      }
      // 代理 GET：/api/github/proxy/*；另外插件内部提供 /api/github/me 快捷（对应 components 调用）
      if ((sub === "/me" || sub === "/me/") && rctx.req.method === "GET") {
        void (async () => {
          try {
            const me = await service.me();
            sendJson(rctx.res, 200, { ok: true, connected: !!me, me: me ?? null });
          } catch (e) {
            sendJson(rctx.res, 200, { ok: false, reason: (e as Error).message });
          }
        })();
        return true;
      }
      const proxyM = sub.match(/^\/proxy\/(.+)$/);
      if (proxyM && rctx.req.method === "GET") {
        void (async () => {
          try {
            const path = "/" + decodeURIComponent(proxyM[1]);
            const qs = rctx.url.search.toString();
            const data = await service.fetchJson(path + qs, { timeoutMs: 20000 });
            sendJson(rctx.res, 200, { ok: true, data });
          } catch (e) {
            sendJson(rctx.res, 502, { ok: false, reason: (e as Error).message });
          }
        })();
        return true;
      }
      return undefined;
    });
    disposers.push(offRoute as () => void);

    // --- 面板：#auth ---
    disposers.push(slots.register("shell.primary", {
      id: "github/auth",
      label: "连接 GitHub",
      order: 10,
      payload: {
        kind: "github-auth-panel",
        title: "连接 GitHub",
        desc: "Personal Access Token (classic) 请勾选 repo + read:user + read:org；只存本地 SQLite。",
        route: "auth",
      },
    }));

    return () => {
      for (const off of disposers.reverse()) try { off(); } catch { /* noop */ }
      if (ctx.has("github")) (ctx as any).unprovide?.("github");
    };
  }
}

export const PLUGIN = new GithubAuthPlugin();
