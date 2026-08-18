# plugin-github 合并插件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 合并 `plugin-github-auth` + `plugin-repo-feed` 为单一 `plugin-github`，实现「gh CLI / Device Flow / PAT 三源连接 + 自有仓库列表（活跃/尘封分区）+ 仓库详情动态（commits 为主）」的 3 页面插件。

**Architecture:** 严格按解耦后基座：Node 侧用 `webServer.register` 前缀路由 + `github` service（fetchJson 聚合）；Client 侧用 `window.__VIBEPM_MODULES__.register` + render 注册表 + Shadow DOM 面板组件。认证三源：gh CLI 实时读 → Device Flow → PAT 兜底。仓库列表由后端逐仓并行拉 events 计算近 30 天提交数并分区（>60 活跃，否则尘封）。不使用任何已废弃的 `ctx.on("web-api/route")` 或壳 URL import。

**Tech Stack:** TypeScript (NodeNext/ES2022) + pnpm workspace + esbuild (client bundle) + Node 22 全局 fetch + Web Components (Shadow DOM)。外部依赖零新增（gh CLI / hosts.yml 用 child_process + fs；Device Flow 用原生 fetch）。

**验证策略（本项目插件无单测设施，遵循现有模式）：** 每个 Task 以「tsc 类型检查 + 构建产物生成」为可编译门，最终以真机运行验收（Task 7）。提交粒度：每个 Task 完成后一个 commit。

**涉及旧包的事实（Task 6 前勿动）：**
- `plugin-github-auth` 提供 `github` service（fetchJson/me），被 `plugin-repo-feed` 依赖；两者 HTTP 路由均用已废弃 `ctx.on("web-api/route")`（全库无 emit，死链路），client 均 import 壳 URL `/plugins/plugin-ide-view/module-system.js`（未迁移）。
- `DEFAULT_BUNDLES.minimal` 在 `packages/cli/src/runtime.ts`（含 plugin-github-auth、plugin-repo-feed）。
- `plugin-plugin-manager` 已目录动态化（display/desc 从 package.json 派生），**无需改**。
- 壳 `plugin-ide-view` 面板渲染已数据驱动（render 注册表），**无需改**。

---

### Task 1: 新插件骨架 + 构建接入

**Files:**
- Create: `packages/plugin-github/package.json`
- Create: `packages/plugin-github/tsconfig.json`
- Create: `packages/plugin-github/src/index.ts`
- Create: `packages/plugin-github/client/index.ts`
- Create: `packages/plugin-github/client/types.d.ts`

- [ ] **Step 1: 创建 package.json**

参照 `packages/plugin-github-auth/package.json`，改 name/id/display/desc，client 构建命令保持 esbuild 外部排除。**不依赖** @vibepm/plugin-github-auth / plugin-repo-feed：

```json
{
  "name": "@vibepm/plugin-github",
  "version": "0.1.0",
  "description": "GitHub 连接 + 自有仓库动态管理（gh CLI / Device Flow / PAT 三源）。",
  "private": true,
  "type": "module",
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./client": {
      "types": "./dist/client/index.d.ts",
      "default": "./dist/client/index.js"
    }
  },
  "scripts": {
    "clean": "rimraf dist client-dist",
    "build:ts": "tsc -b",
    "build:client": "esbuild client/index.ts --bundle --format=esm --outfile=client-dist/client.js --platform=browser --external:@vibepm/*",
    "build": "pnpm run clean && pnpm run build:ts && pnpm run build:client",
    "dev": "pnpm run build"
  },
  "dependencies": {
    "@vibepm/core": "workspace:*",
    "@vibepm/plugin-ide-view": "workspace:*",
    "@vibepm/plugin-web-ui": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.10.10",
    "esbuild": "^0.24.2",
    "rimraf": "^6.0.1",
    "typescript": "^5.7.3"
  },
  "vibepm": {
    "id": "plugin-github",
    "display": "GitHub",
    "role": "service+panel",
    "order": 20,
    "node": {
      "immediately": true,
      "inject": ["db", "slots", "webServer"],
      "provide": ["github"]
    },
    "client": {
      "entry": "./client-dist/client.js",
      "inject": [],
      "provide": [],
      "immediately": true
    },
    "configSchema": {
      "type": "object",
      "properties": {
        "api_base": { "type": "string", "default": "https://api.github.com" },
        "client_id": { "type": "string", "default": "" },
        "cache_ttl": { "type": "number", "default": 60 },
        "active_window_days": { "type": "number", "default": 30 },
        "active_min_commits": { "type": "number", "default": 60 },
        "stats_window_days": { "type": "number", "default": 30 }
      }
    }
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

参照 `packages/plugin-github-auth/tsconfig.json`（extends 根 base，rootDir "."，include src + client）：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "tsBuildInfoFile": "dist/.tsbuildinfo",
    "composite": true
  },
  "include": ["src/**/*.ts", "client/**/*.ts", "client/**/*.d.ts"],
  "references": [
    { "path": "../core/tsconfig.json" },
    { "path": "../plugin-ide-view/tsconfig.json" },
    { "path": "../plugin-web-ui/tsconfig.json" }
  ]
}
```

- [ ] **Step 3: 创建最小 Node 入口 src/index.ts（占位 apply，Task 2 填充）**

```ts
import type { Context } from "@vibepm/core";

class GithubPlugin {
  name = "plugin-github";
  provide = ["github"];
  inject = ["db", "slots", "webServer"] as const;

  apply(ctx: Context): () => void {
    return () => undefined;
  }
}

export const PLUGIN = new GithubPlugin();
```

- [ ] **Step 4: 创建最小 client 入口 + ambient 声明**

`client/index.ts`（解耦后标准：window 模块表，不 import 壳 URL）：

```ts
// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};

modules.register("plugin-github", () => ({
  name: "plugin-github",
  inject: [],
  provide: [],
  apply(_ctx: unknown) {
    // Task 5 填充：customElements.define + render.register
  },
}));
```

`client/types.d.ts`（保留，供 client 侧非 TS 模块用；此插件 client 无外部模块 import，可留空声明）：

```ts
export {};
```

- [ ] **Step 5: 构建验证**

Run: `pnpm --filter @vibepm/plugin-github run build`
Expected: 生成 `dist/` 与 `client-dist/client.js`，无 TS 错误。随后根 `pnpm run lint`（tsc -p tsconfig.base.json --noEmit）通过。

- [ ] **Step 6: 提交**

```bash
git add packages/plugin-github
git commit -m "feat(github): 新建 plugin-github 骨架（三源连接 + 仓库动态合并插件）"
```

---

### Task 2: Node 侧认证三源 + github service + status/login/logout API

**Files:**
- Create: `packages/plugin-github/src/auth.ts`
- Create: `packages/plugin-github/src/github-service.ts`
- Modify: `packages/plugin-github/src/index.ts`

- [ ] **Step 1: 写 auth.ts（gh CLI 读取 + hosts.yml 解析 + 三源 token 解析）**

gh CLI 优先 `gh auth token`；失败回退解析 hosts.yml。hosts.yml 用行扫描（不引 YAML 库）。

```ts
// 认证三源 token 解析：gh CLI 实时读 → settings 里的 device/pat token
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type TokenSource = "gh" | "device" | "pat";

/** 尝试 gh auth token；gh 不存在/未登录 → null */
export function ghToken(): string | null {
  try {
    const out = execFileSync("gh", ["auth", "token"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 8000,
      windowsHide: true,
    });
    const t = String(out ?? "").trim();
    return t || null;
  } catch {
    return null;
  }
}

/** gh 不存在时回退解析 hosts.yml 的 github.com.oauth_token */
export function ghHostsToken(): string | null {
  const candidates: string[] = process.platform === "win32"
    ? [join(process.env.APPDATA ?? "", "GitHub CLI", "hosts.yml")]
    : [join(homedir(), ".config", "gh", "hosts.yml")];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    let text = "";
    try { text = readFileSync(p, "utf-8"); } catch { continue; }
    // 定位 github.com: 段，取其下 oauth_token: <token>
    const lines = text.split(/\r?\n/);
    let inGithub = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("github.com:") || trimmed === "github.com") { inGithub = true; continue; }
      if (inGithub && /^[^:#][^:]*:/.test(trimmed) && !trimmed.startsWith("oauth_token")) { inGithub = false; }
      if (inGithub && /^oauth_token\s*:/.test(trimmed)) {
        const m = trimmed.match(/oauth_token\s*:\s*(?:"([^"]+)"|'([^']+)'|(\S+))/);
        const t = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
        if (t) return t;
      }
    }
  }
  return null;
}

/** 解析 token 来源：gh CLI（含 hosts 回退）→ settings 里的 device/pat */
export function resolveToken(getSetting: <T = unknown>(k: string) => T | null): {
  token: string | null;
  source: TokenSource;
} {
  const gh = ghToken() ?? ghHostsToken();
  if (gh) return { token: gh, source: "gh" };
  const stored = getSetting<string>("github.token");
  if (stored) return { token: stored, source: (getSetting<string>("github.source") as TokenSource) ?? "pat" };
  return { token: null, source: "pat" };
}
```

- [ ] **Step 2: 写 github-service.ts（增强 GitHubService + TTL 缓存）**

复用并增强现有 GitHubService：保留 `fetchJson` / `me`，新增 `listRepos` / `repoEvents` / `commitFrequency` 与内存 TTL 缓存。

```ts
// GitHub REST 封装：fetchJson 通用 + 仓库/事件聚合 + TTL 缓存
import { resolveToken } from "./auth.js";

export type DbLike = {
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

export type GhUser = { login: string; name?: string; avatar_url?: string };
export type RepoMeta = {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  private: boolean;
  archived: boolean;
  fork: boolean;
  updated_at: string;
};

export class GitHubService {
  name = "github";
  constructor(
    private readonly db: DbLike,
    private readonly apiBase = "https://api.github.com",
    private readonly cacheTtlMs = 60_000,
  ) {}

  // ---- token ----
  token(): string | null { return this.db.getSetting<string>("github.token"); }
  username(): string | null { return this.db.getSetting<string>("github.username"); }
  source(): string { return this.db.getSetting<string>("github.source") ?? "pat"; }

  // ---- 缓存（key 含 token 尾 8 位，logout 清空）----
  private cache = new Map<string, { at: number; val: unknown }>();
  cacheGet<T>(key: string): T | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.cacheTtlMs) { this.cache.delete(key); return undefined; }
    return hit.val as T;
  }
  cacheSet(key: string, val: unknown): void { this.cache.set(key, { at: Date.now(), val }); }
  clearCache(): void { this.cache.clear(); }

  // ---- 通用请求 ----
  async fetchJson(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<any> {
    const { token } = resolveToken((k) => this.db.getSetting(k));
    if (!token) throw Object.assign(new Error("未连接 GitHub"), { code: "NO_TOKEN" });
    const base = this.apiBase;
    const url = /^https?:/.test(path) ? path : base + (path.startsWith("/") ? "" : "/") + path;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
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
    catch (e) { if ((e as any).code === "NO_TOKEN") return null; throw e; }
  }

  // ---- 仓库列表（分页合并全量）----
  async listRepos(): Promise<RepoMeta[]> {
    const out: any[] = [];
    let page = 1;
    for (;;) {
      const batch = await this.fetchJson(`/user/repos?per_page=100&sort=updated&page=${page}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      out.push(...batch);
      if (batch.length < 100) break;
      page += 1;
    }
    return out as RepoMeta[];
  }

  // ---- 单仓 events ----
  async repoEvents(owner: string, repo: string): Promise<any[]> {
    const data = await this.fetchJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/events?per_page=100`);
    return Array.isArray(data) ? data : [];
  }

  // ---- 提交频率：近 N 天 PushEvent distinct_size 累加 ----
  commitFrequency(events: any[], days: number): number {
    const cutoff = Date.now() - days * 86400_000;
    let n = 0;
    for (const e of events) {
      if (e?.type !== "PushEvent") continue;
      const at = Date.parse(e?.created_at ?? "");
      if (!Number.isFinite(at) || at < cutoff) continue;
      n += Number(e?.payload?.distinct_size ?? e?.payload?.size ?? 0) || 0;
    }
    return n;
  }
}
```

- [ ] **Step 3: 改 src/index.ts —— 提供 github service + status/login/logout API**

改用解耦后标准：`webServer.register` 前缀路由；inject db/slots/webServer。token 三源解析在 service 内完成（gh 实时读）。settings 存 `github.username` / `github.token` / `github.source`。

```ts
import type { Context } from "@vibepm/core";
import { readBody, sendJson, routeCtx, type WebServerService } from "@vibepm/plugin-web-ui";
import type { SlotService } from "@vibepm/plugin-ide-view";
import { GitHubService } from "./github-service.js";

export type DbLike = {
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

class GithubPlugin {
  name = "plugin-github";
  provide = ["github"];
  inject = ["db", "slots", "webServer"] as const;

  apply(ctx: Context): () => void {
    const db = ctx.get("db") as any as DbLike;
    const slots = ctx.get("slots") as any as SlotService;
    const ws = ctx.get("webServer") as WebServerService;
    const disposers: Array<() => void> = [];

    const cfg = { ...ctx.mergedConfig("github"), ...ctx.mergedConfig("plugin-github") } as {
      api_base?: string; client_id?: string; cache_ttl?: number;
      active_window_days?: number; active_min_commits?: number; stats_window_days?: number;
    };
    const service = new GitHubService(
      db,
      cfg.api_base ?? "https://api.github.com",
      (cfg.cache_ttl ?? 60) * 1000,
    );
    ctx.provide("github", service);

    // --- API：webServer 前缀路由（解耦后标准，不用旧 web-api/route）---
    disposers.push(ws.register({
      kind: "prefix",
      path: "/api/github",
      handler: (req, res) => {
        const rctx = routeCtx(req, res);
        const sub = rctx.path.slice("/api/github".length) || "/";

        // GET /status
        if ((sub === "/status" || sub === "/status/") && rctx.req.method === "GET") {
          void (async () => {
            try {
              const me = await service.me();
              if (!me) { sendJson(rctx.res, 200, { ok: true, connected: false }); return; }
              sendJson(rctx.res, 200, { ok: true, connected: true, source: service.source(), username: me.login, me });
            } catch (e) { sendJson(rctx.res, 200, { ok: false, connected: false, reason: (e as Error).message }); }
          })();
          return;
        }

        // POST /login（PAT 兜底）
        if ((sub === "/login" || sub === "/login/") && rctx.req.method === "POST") {
          void (async () => {
            try {
              const body = await readBody(rctx.req);
              const username = String(body.username ?? "").trim();
              const token = String(body.token ?? "").trim();
              if (!username || !token) { sendJson(rctx.res, 400, { ok: false, reason: "需要 username + token" }); return; }
              db.setSetting("github.username", username);
              db.setSetting("github.token", token);
              db.setSetting("github.source", "pat");
              const me = await service.me();
              sendJson(rctx.res, 200, { ok: !!me, me: me ?? null });
            } catch (e) { sendJson(rctx.res, 200, { ok: false, reason: (e as Error).message }); }
          })();
          return;
        }

        // POST /logout
        if ((sub === "/logout" || sub === "/logout/") && rctx.req.method === "POST") {
          db.deleteSetting("github.token");
          db.deleteSetting("github.username");
          db.deleteSetting("github.source");
          service.clearCache();
          sendJson(rctx.res, 200, { ok: true });
          return;
        }

        // GET /repos/:owner/:repo/events（单仓动态）
        const evM = sub.match(/^\/repos\/([^/]+)\/([^/]+)\/events\/?$/);
        if (evM && rctx.req.method === "GET") {
          void (async () => {
            try {
              const owner = decodeURIComponent(evM[1]);
              const repo = decodeURIComponent(evM[2]);
              const key = `ev:${owner}/${repo}`;
              const cached = service.cacheGet<any[]>(key);
              if (cached) { sendJson(rctx.res, 200, { ok: true, items: cached }); return; }
              const raw = await service.repoEvents(owner, repo);
              service.cacheSet(key, raw);
              sendJson(rctx.res, 200, { ok: true, items: raw });
            } catch (e) { sendJson(rctx.res, 502, { ok: false, reason: (e as Error).message, items: [] }); }
          })();
          return;
        }

        // GET /repos（列表 + 提交频率 + 分区）
        if ((sub === "/repos" || sub === "/repos/") && rctx.req.method === "GET") {
          void (async () => {
            try {
              const windowDays = cfg.active_window_days ?? 30;
              const minCommits = cfg.active_min_commits ?? 60;
              const statsDays = cfg.stats_window_days ?? 30;
              const repos = await service.listRepos();
              const withStats = repos.map((r) => ({ ...r, commits30d: 0, active: false }));
              // 逐仓并行拉 events，并发上限 5
              const pool: Promise<void>[] = [];
              const queue = [...withStats];
              for (let i = 0; i < Math.min(5, queue.length); i++) {
                pool.push((async () => {
                  for (;;) {
                    const item = queue.shift();
                    if (!item) return;
                    const [owner, repo] = item.full_name.split("/");
                    try {
                      const raw = await service.repoEvents(owner, repo);
                      const evKey = `ev:${owner}/${repo}`;
                      service.cacheSet(evKey, raw);
                      const n = service.commitFrequency(raw, windowDays);
                      const m = service.commitFrequency(raw, statsDays);
                      item.commits30d = m;
                      item.active = n > minCommits;
                    } catch { /* 单仓失败跳过，标记 false */ }
                  }
                })());
              }
              await Promise.all(pool);
              const active = withStats.filter((r) => r.active).sort((a, b) => b.commits30d - a.commits30d);
              const dusty = withStats.filter((r) => !r.active).sort((a, b) => b.commits30d - a.commits30d);
              sendJson(rctx.res, 200, {
                ok: true, connected: true,
                repos: [...active, ...dusty],
                activeCount: active.length,
                dustyCount: dusty.length,
              });
            } catch (e) { sendJson(rctx.res, 502, { ok: false, reason: (e as Error).message }); }
          })();
          return;
        }

        sendJson(rctx.res, 404, { ok: false, reason: "not found" });
      },
    }));

    // --- 面板 #auth（Task 5 注册 client 组件后生效）---
    disposers.push(slots.register("shell.primary", {
      id: "github/auth",
      label: "连接 GitHub",
      order: 10,
      payload: { kind: "github-auth-panel", title: "连接 GitHub", desc: "gh CLI 直连 / Device Flow / PAT 兜底；只读自己仓库动态。", route: "auth" },
    }));
    disposers.push(slots.register("shell.nav", {
      id: "github/auth-nav",
      label: "连接 GitHub",
      order: 10,
      payload: { kind: "nav-card", icon: "github", desc: "连接 GitHub（gh / Device Flow / PAT）", hash: "#auth", orderHint: 10 },
    }));
    disposers.push(slots.register("shell.primary", {
      id: "github/repos",
      label: "我的仓库",
      order: 20,
      payload: { kind: "github-repos-panel", title: "我的仓库", desc: "自有仓库，按近 30 天提交分区（活跃 / 尘封）", route: "repos" },
    }));
    disposers.push(slots.register("shell.nav", {
      id: "github/repos-nav",
      label: "我的仓库",
      order: 20,
      payload: { kind: "nav-card", icon: "repo", desc: "自有仓库列表：活跃区 + 尘封区", hash: "#repos", orderHint: 20 },
    }));

    return () => {
      for (const off of disposers.reverse()) try { off(); } catch { /* noop */ }
      if (ctx.has("github")) (ctx as any).unprovide?.("github");
    };
  }
}

export const PLUGIN = new GithubPlugin();
```

- [ ] **Step 4: 构建 + 类型检查**

Run: `pnpm --filter @vibepm/plugin-github run build`
Expected: 无 TS 错误，产出 dist + client-dist。随后 `pnpm run lint` 通过。

- [ ] **Step 5: 提交**

```bash
git add packages/plugin-github
git commit -m "feat(github): Node 侧认证三源解析 + github service 增强 + status/login/logout API"
```

---

### Task 3: Device Flow API（start / poll）

**Files:**
- Modify: `packages/plugin-github/src/index.ts`

- [ ] **Step 1: 在 handler 内加 /device/start 与 /device/poll 分支**

在 `/api/github` handler 内、`/repos` 分支之前插入：

```ts
        // POST /device/start —— 发起 Device Flow
        if ((sub === "/device/start" || sub === "/device/start/") && rctx.req.method === "POST") {
          void (async () => {
            try {
              const clientId = cfg.client_id ?? "";
              if (!clientId) {
                sendJson(rctx.res, 400, { ok: false, reason: "未配置 client_id：请在配置 github.client_id 填 GitHub OAuth App 的公开 client_id" });
                return;
              }
              const r = await fetch("https://github.com/login/device/code", {
                method: "POST",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ client_id: clientId, scope: "repo read:user read:org" }),
              });
              const d = await r.json() as any;
              if (d.error) { sendJson(rctx.res, 502, { ok: false, reason: d.error_description ?? d.error }); return; }
              // 存 device_code 供 poll
              db.setSetting("github.device_code", String(d.device_code ?? ""));
              db.setSetting("github.device_expires", String(Date.now() + (Number(d.expires_in ?? 900) * 1000)));
              sendJson(rctx.res, 200, {
                ok: true,
                user_code: d.user_code,
                verification_uri: d.verification_uri,
                expires_in: d.expires_in,
                interval: d.interval ?? 5,
              });
            } catch (e) { sendJson(rctx.res, 502, { ok: false, reason: (e as Error).message }); }
          })();
          return;
        }

        // POST /device/poll —— 轮询授权状态
        if ((sub === "/device/poll" || sub === "/device/poll/") && rctx.req.method === "POST") {
          void (async () => {
            try {
              const clientId = cfg.client_id ?? "";
              const deviceCode = db.getSetting<string>("github.device_code");
              if (!clientId || !deviceCode) { sendJson(rctx.res, 400, { ok: false, status: "no_pending" }); return; }
              const expires = Number(db.getSetting<string>("github.device_expires") ?? 0);
              if (expires && Date.now() > expires) { sendJson(rctx.res, 200, { ok: false, status: "expired" }); return; }
              const r = await fetch("https://github.com/login/oauth/access_token", {
                method: "POST",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({
                  client_id: clientId,
                  device_code: deviceCode,
                  grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                }),
              });
              const d = await r.json() as any;
              if (d.access_token) {
                db.deleteSetting("github.device_code");
                db.deleteSetting("github.device_expires");
                db.setSetting("github.token", String(d.access_token));
                db.setSetting("github.source", "device");
                db.setSetting("github.username", String((await service.me())?.login ?? ""));
                sendJson(rctx.res, 200, { ok: true, connected: true });
                return;
              }
              if (d.error === "authorization_pending") { sendJson(rctx.res, 200, { ok: false, status: "pending" }); return; }
              if (d.error === "slow_down") { sendJson(rctx.res, 200, { ok: false, status: "pending" }); return; }
              if (d.error === "expired_token") { sendJson(rctx.res, 200, { ok: false, status: "expired" }); return; }
              if (d.error === "access_denied") { sendJson(rctx.res, 200, { ok: false, status: "denied" }); return; }
              sendJson(rctx.res, 200, { ok: false, status: "error", reason: d.error_description ?? d.error });
            } catch (e) { sendJson(rctx.res, 502, { ok: false, status: "error", reason: (e as Error).message }); }
          })();
          return;
        }
```

- [ ] **Step 2: 构建 + 提交**

Run: `pnpm --filter @vibepm/plugin-github run build && pnpm run lint`
Expected: 无错误。

```bash
git add packages/plugin-github
git commit -m "feat(github): Device Flow 授权（start/poll，client_id 可配置）"
```

---

### Task 4: 仓库列表聚合 API（提交频率 + 分区）—— 已在 Task 2 Step 3 实现

> 说明：`/repos` 聚合（逐仓并行 events + commitFrequency + 活跃/尘封分区）已在 Task 2 Step 3 的代码中实现，无需额外 Task 改动。此处仅确认分区判据与配置键：`active` = 近 `active_window_days`(30) 天提交数 > `active_min_commits`(60)；列表行展示 `commits30d`（近 `stats_window_days`(30) 天）。

- [ ] **Step 1: 自查上述代码存在且字段一致**

确认 `src/index.ts` 含 `/repos` 分支（pool 并发 5 + active/dusty 分组 + `repos: [...active, ...dusty]`）。字段名 `commits30d`、`active`、`activeCount`、`dustyCount` 前后一致。

---

### Task 5: Client 三面板 + 路由守卫 + render 注册

**Files:**
- Create: `packages/plugin-github/client/components.ts`
- Modify: `packages/plugin-github/client/index.ts`
- Modify: `packages/plugin-github/client/types.d.ts`

- [ ] **Step 1: 写 client/components.ts —— 三个 Web Component**

复用现有科研黄黑皮肤变量（--skin-* / --yellow / --mono / --display-cjk），Shadow DOM 隔离。三个组件：

- `GithubAuthPanel`（改造旧 auth 面板）：未登录展示「连接状态 + Device Flow 区块（授权码 + verification_uri 链接 + 自动轮询）+ PAT 兜底折叠表单」；已登录只显示状态条（账号 + 来源 + 退出 + 切换）。
- `GithubReposPanel`：进入先守卫（GET /status，未连接 → `location.hash = "#auth"`）；连接后 GET /repos，渲染活跃区 + 尘封区（默认折叠）；行含名称/描述/语言色点/star/fork/「近 30 天提交 N 次」/更新时间/打开链接；点行进 `#repo?name=full_name`。
- `GithubRepoDetailPanel`：从 `parseHash(location.hash).params.get("name")` 读 full_name；守卫同上；GET `/repos/:owner/:repo/events` 渲染 meta 条 + 动态 timeline（push 展开 commit subject 列表，无 diff）。

完整代码（一个文件，三组件）：

```ts
// 面板三件套：认证 / 仓库列表 / 仓库详情（科研黄黑皮肤，Shadow DOM）
const CSS = /* css */`
:host{display:block}
h1{font-size:16px;letter-spacing:1.5px;color:var(--fg,#f6f7f3);margin:0 0 6px 0;font-weight:900;text-transform:uppercase;font-family:var(--display-cjk, sans-serif)}
.desc{font-size:12px;color:var(--dim,#9aa0a7);margin-bottom:16px;line-height:1.6}
.status{display:inline-block;padding:4px 9px;font:700 9px/1 var(--mono, monospace);letter-spacing:1px;border:1px solid var(--line,#5f656b);color:var(--dim,#9aa0a7);margin-bottom:12px;text-transform:uppercase}
.status.on{color:#111;border-color:var(--yellow,#fff44f);background:var(--yellow,#fff44f);box-shadow:3px 3px 0 rgba(0,0,0,.55)}
.card{border:1px solid var(--fg,#fff);border-left:5px solid var(--yellow,#fff44f);background:var(--panel,#f3f3f0);color:#0a0b0d;padding:14px 16px;margin-bottom:14px;box-shadow:4px 5px 0 rgba(0,0,0,.4)}
.form{border:1px dashed var(--line,#3c4147);border-left:3px solid var(--yellow,#fff44f);background:var(--bg2,#16191c);padding:14px 16px;margin-top:8px}
label{font-size:10px;color:var(--dim,#9aa0a7);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:6px;font-family:var(--mono, monospace)}
input[type=text],input[type=password]{width:100%;background:#0d0f11;border:1px solid var(--line,#383d43);border-left:3px solid #7b8188;color:var(--fg,#f6f7f3);font-family:var(--mono, monospace);font-size:12px;padding:8px 10px}
button{border:1px solid var(--line,#5f656b);border-left:3px solid #899096;background:#303438;color:var(--fg,#f6f7f3);padding:7px 14px;cursor:pointer;font:700 11px/1 var(--display-cjk, sans-serif);letter-spacing:.5px;box-shadow:2px 3px 0 #050607;transition:color .18s,box-shadow .18s}
button:hover{border-color:var(--yellow,#fff44f);color:var(--yellow,#fff44f);box-shadow:3px 4px 0 #050607}
button.primary{border-color:#4d5257;border-left-color:var(--yellow,#fff44f)}
.hidden{display:none}
.msg{font-size:11px;margin-left:4px}.msg.ok{color:var(--yellow,#fff44f)}.msg.err{color:#ff9c98}
/* 列表 */
.zhead{display:flex;align-items:baseline;gap:8px;margin:18px 0 8px 0;padding-left:10px;border-left:3px solid var(--yellow,#fff44f);cursor:pointer}
.zhead h2{font-size:12px;color:var(--fg,#f6f7f3);margin:0;letter-spacing:1px;font-family:var(--mono, monospace)}
.zhead .cnt{font-size:11px;color:var(--dim,#9aa0a7);font-family:var(--mono, monospace)}
.repo{border:1px solid var(--line,#3c4147);background:var(--bg2,#16191c);padding:10px 12px;margin-bottom:6px;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;transition:border-color .15s}
.repo:hover{border-color:var(--yellow,#fff44f)}
.repo .nm{font-size:12px;color:var(--fg,#f6f7f3);font-weight:700;font-family:var(--mono, monospace)}
.repo .ds{font-size:11px;color:var(--dim,#9aa0a7);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.repo .meta{font-size:11px;color:var(--dim,#9aa0a7);font-family:var(--mono, monospace);text-align:right}
.lang{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
/* timeline */
.tl{list-style:none;padding:0;margin:0;border-top:1px solid var(--line,#3c4147)}
.tl li{padding:10px 0;border-bottom:1px solid var(--line,#2b2f33);display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:start}
.tl .dot{width:30px;height:30px;border:1px solid var(--yellow,#fff44f);background:#0d0f11;display:flex;align-items:center;justify-content:center;color:var(--yellow,#fff44f)}
.tl .dot svg{width:13px;height:13px}
.tl h4{font-size:12px;color:var(--fg,#f6f7f3);margin:0 0 3px 0;font-weight:700;line-height:1.4;font-family:var(--display-cjk, sans-serif)}
.tl p{font-size:12px;color:var(--dim,#9aa0a7);margin:0;line-height:1.5}
.tl time{font-size:11px;color:var(--dim,#9aa0a7);letter-spacing:.5px;white-space:nowrap;font-family:var(--mono, monospace)}
.commit{font-family:var(--mono, monospace);font-size:11px;color:var(--dim,#9aa0a7);margin:2px 0 0 0;padding-left:10px;border-left:1px dashed var(--line,#3c4147)}
.commit b{color:var(--yellow,#fff44f);font-weight:600}
.empty{padding:24px;text-align:center;color:var(--dim,#9aa0a7);font-size:12px;border:1px dashed var(--line,#3c4147);background:var(--bg2,#16191c)}
`;

const ICONS: Record<string, string> = {
  push: `<path d="M3 12 h10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M11 7 l5 5 l-5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  pr: `<path d="M6 3 a2 2 0 1 0 0 4 2 2 0 0 0 0 -4 z"/><circle cx="18" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 7 v10 M10 10 h4 a4 4 0 0 1 4 4 v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  issue: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5 v5.5 M12 16.2 v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  release: `<path d="M12 3 v4 M12 17 v4 M5 9 l-3.5 -2 M22 9 l-3.5 -2 M5 15 l-3.5 2 M22 15 l-3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  star: `<path d="M12 3.5 l2.7 5.6 6.1.9 -4.4 4.3 1 6 -5.4 -2.9 -5.4 2.9 1 -6 -4.4 -4.3 6.1 -.9 z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`,
  fork: `<circle cx="6" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 7 v2 a2 2 0 0 0 2 2 h8 a2 2 0 0 0 2 -2 V7 M12 11 v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  create: `<path d="M12 3 v18 M3 12 h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  watch: `<circle cx="12" cy="12" r="2.2" fill="currentColor" opacity=".9"/><path d="M3 12 s3.5 -7 9 -7 9 7 9 7 -3.5 7 -9 7 -9 -7 -9 -7 z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  other: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
};

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(diff) || diff < 0) return "";
  const f = (n: number, u: string) => `${Math.floor(n)} ${u}前`;
  if (diff < 60) return f(diff, "秒");
  if (diff < 3600) return f(diff / 60, "分");
  if (diff < 86400) return f(diff / 3600, "小时");
  if (diff < 86400 * 30) return f(diff / 86400, "天");
  return new Date(iso).toISOString().slice(0, 10);
}

function classify(type: string): string {
  const map: Record<string, string> = { PushEvent: "push", PullRequestEvent: "pr", IssuesEvent: "issue", ReleaseEvent: "release", WatchEvent: "watch", ForkEvent: "fork", CreateEvent: "create", StarEvent: "star" };
  return map[type] ?? "other";
}

function oneLine(e: any): string {
  try {
    const p: any = e.payload ?? {};
    switch (e.type) {
      case "PushEvent": { const n = p.distinct_size ?? p.commits?.length ?? 0; const head = p.commits?.[0]?.message?.split("\n")[0] ?? ""; return `推送 ${n} 个提交${head ? " · " + head : ""}`; }
      case "PullRequestEvent": return `PR ${p.action} · ${p.pull_request?.title ?? ""}`;
      case "IssuesEvent": return `Issue ${p.action} · ${p.issue?.title ?? ""}`;
      case "ReleaseEvent": return `发布 ${p.release?.tag_name ?? ""}`;
      case "WatchEvent": return `已关注（star）`;
      case "ForkEvent": return `Fork 到 ${p.forkee?.full_name ?? "?"}`;
      case "CreateEvent": return `创建 ${p.ref_type}${p.ref ? " · " + p.ref : ""}`;
      case "StarEvent": return `已 star`;
      default: return e.type;
    }
  } catch { return e.type ?? ""; }
}

async function api<T = any>(p: string, m: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const r = await fetch("/api/github" + p, { method: m, headers: body ? { "Content-Type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  return await r.json();
}

/** 入口守卫：未连接强制跳 #auth（共享） */
async function guard(): Promise<{ connected: boolean }> {
  try {
    const r = await api<{ connected: boolean }>("/status");
    if (!r.connected) { location.hash = "#auth"; return { connected: false }; }
    return { connected: true };
  } catch { location.hash = "#auth"; return { connected: false }; }
}

// ============ 认证面板 ============
export class GithubAuthPanel extends HTMLElement {
  private timer: number | undefined;
  connectedCallback(): void { this.attachShadow({ mode: "open" }); void this.render(); }
  disconnectedCallback(): void { if (this.timer) window.clearInterval(this.timer); }
  private setMsg(text: string, kind: "ok" | "err" = "ok"): void {
    const el = this.shadowRoot!.getElementById("msg")!;
    el.className = "msg " + kind; el.textContent = text;
  }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style>
      <h1>连接 GitHub</h1>
      <p class="desc">gh CLI 直连 / Device Flow / PAT 三源。只读自己仓库动态，不做拉取推送。</p>
      <div><span class="status" id="st">读取中…</span></div>
      <div id="meCard" class="card hidden">
        <div id="meText"></div>
        <div style="margin-top:10px;display:flex;gap:8px"><button id="btnLogout">退出</button><button id="btnSwitch" class="ghost">切换账号</button></div>
      </div>
      <div id="authBox" class="form hidden">
        <h3 style="font:700 10px/1 var(--mono,monospace);color:var(--dim,#9aa0a7);letter-spacing:1.2px;text-transform:uppercase;margin:0 0 10px 0">浏览器授权（Device Flow）</h3>
        <p class="desc" id="dInfo">点下方按钮开始，浏览器打开后输入授权码。</p>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
          <button id="btnDevice" class="primary">通过浏览器授权</button>
          <code id="dCode" style="font:700 18px/1 var(--mono,monospace);color:var(--yellow,#fff44f)"></code>
          <a id="dVuri" target="_blank" rel="noreferrer noopener" style="display:none;color:var(--yellow,#fff44f);font-size:12px">打开授权页</a>
        </div>
        <h3 style="font:700 10px/1 var(--mono,monospace);color:var(--dim,#9aa0a7);letter-spacing:1.2px;text-transform:uppercase;margin:14px 0 10px 0">手动 Token（兜底）</h3>
        <div class="hidden" id="patBox">
          <label>GitHub 用户名</label><input id="u" type="text" autocomplete="username" spellcheck="false"/>
          <label style="margin-top:10px">Personal Access Token (classic)</label><input id="t" type="password" autocomplete="new-password" spellcheck="false"/>
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button id="btnLogin" class="primary">连接</button><span class="msg" id="msg"></span></div>
        </div>
        <button id="btnPat" style="margin-top:10px" class="ghost">显示 / 隐藏手动表单</button>
      </div>`;
    s.getElementById("btnLogin")!.addEventListener("click", () => void this.login());
    s.getElementById("btnLogout")!.addEventListener("click", () => void this.logout());
    s.getElementById("btnSwitch")!.addEventListener("click", () => { (s.getElementById("authBox") as HTMLElement).classList.remove("hidden"); (s.getElementById("meCard") as HTMLElement).classList.add("hidden"); });
    s.getElementById("btnDevice")!.addEventListener("click", () => void this.deviceStart());
    s.getElementById("btnPat")!.addEventListener("click", () => { (s.getElementById("patBox") as HTMLElement).classList.toggle("hidden"); });
    await this.refresh();
  }
  private async refresh(): Promise<void> {
    const s = this.shadowRoot!;
    const st = s.getElementById("st")!;
    st.className = "status"; st.textContent = "读取中…";
    try {
      const r = await api<{ connected: boolean; source?: string; username?: string; me?: any }>("/status");
      if (r.connected) {
        st.className = "status on"; st.textContent = `已连接 · ${r.source ?? "?"}`;
        (s.getElementById("meCard") as HTMLElement).classList.remove("hidden");
        (s.getElementById("authBox") as HTMLElement).classList.add("hidden");
        s.getElementById("meText")!.textContent = `${r.me?.name ?? r.username ?? ""} (@${r.username ?? ""}) · 来源 ${r.source ?? "?"}`;
      } else {
        st.textContent = "未连接";
        (s.getElementById("meCard") as HTMLElement).classList.add("hidden");
        (s.getElementById("authBox") as HTMLElement).classList.remove("hidden");
      }
    } catch (e) { st.textContent = "查询失败"; this.setMsg((e as Error).message, "err"); }
  }
  private async login(): Promise<void> {
    const s = this.shadowRoot!;
    const u = (s.getElementById("u") as HTMLInputElement).value.trim();
    const t = (s.getElementById("t") as HTMLInputElement).value.trim();
    if (!u || !t) { this.setMsg("请填用户名 + token", "err"); return; }
    this.setMsg("连接中…", "ok");
    const r = await api<{ ok: boolean; reason?: string }>("/login", "POST", { username: u, token: t });
    if (r.ok) { this.setMsg("连接成功", "ok"); (s.getElementById("t") as HTMLInputElement).value = ""; await this.refresh(); }
    else this.setMsg(r.reason ?? "连接失败", "err");
  }
  private async logout(): Promise<void> {
    await api("/logout", "POST");
    await this.refresh();
  }
  private async deviceStart(): Promise<void> {
    const s = this.shadowRoot!;
    const r = await api<{ ok: boolean; reason?: string; user_code?: string; verification_uri?: string; interval?: number }>("/device/start", "POST");
    if (!r.ok) { this.setMsg(r.reason ?? "启动失败", "err"); return; }
    s.getElementById("dCode")!.textContent = r.user_code ?? "";
    const a = s.getElementById("dVuri") as HTMLAnchorElement;
    a.href = r.verification_uri ?? ""; a.style.display = "inline";
    a.textContent = `打开授权页：${r.verification_uri ?? ""}`;
    this.setMsg("等待授权…", "ok");
    const iv = (r.interval ?? 5) * 1000;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.devicePoll(), iv);
  }
  private async devicePoll(): Promise<void> {
    const r = await api<{ ok: boolean; status?: string }>("/device/poll", "POST");
    if (r.ok) { if (this.timer) window.clearInterval(this.timer); this.setMsg("授权成功", "ok"); await this.refresh(); }
    else if (r.status === "expired" || r.status === "denied") {
      if (this.timer) window.clearInterval(this.timer);
      this.setMsg(r.status === "denied" ? "已拒绝授权" : "授权码过期", "err");
    }
  }
}

// ============ 仓库列表面板 ============
export class GithubReposPanel extends HTMLElement {
  connectedCallback(): void { this.attachShadow({ mode: "open" }); void this.render(); }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style><h1>我的仓库</h1><p class="desc">加载中…</p>`;
    if (!(await guard()).connected) return;
    const r = await api<{ repos?: any[]; activeCount?: number; dustyCount?: number }>("/repos");
    const repos = r.repos ?? [];
    const active = repos.filter((x) => x.active);
    const dusty = repos.filter((x) => !x.active);
    s.innerHTML = `<style>${CSS}</style>
      <h1>我的仓库</h1>
      <p class="desc" id="desc">共 ${repos.length} 个 · 活跃 ${active.length} · 尘封 ${dusty.length} · 近 30 天提交 &gt; 60 为活跃</p>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><button id="reload" class="primary">刷新</button><span class="msg" id="msg"></span></div>
      <div id="list"></div>`;
    s.getElementById("reload")!.addEventListener("click", () => void this.render());
    const list = s.getElementById("list")!;
    const zhead = (title: string, cnt: number, open: boolean) =>
      `<div class="zhead" data-z="${title}"><h2>${title}</h2><span class="cnt">${cnt}</span></div><div class="zb" ${open ? "" : "style='display:none'"}></div>`;
    const html: string[] = [];
    html.push(zhead("活跃区", active.length, true));
    for (const x of active) html.push(this.row(x));
    html.push(zhead("尘封区", dusty.length, false));
    for (const x of dusty) html.push(this.row(x));
    list.innerHTML = html.join("");
    for (const z of list.querySelectorAll<HTMLElement>(".zhead")) {
      z.addEventListener("click", () => { const b = z.nextElementSibling as HTMLElement; b.style.display = b.style.display === "none" ? "" : "none"; });
    }
  }
  private row(x: any): string {
    const lang = x.language ? `<span class="lang" style="background:${this.langColor(x.language)}"></span>${x.language}` : "";
    const desc = x.description ? `<div class="ds">${this.esc(x.description)}</div>` : "";
    const href = `/repo?name=${encodeURIComponent(x.full_name)}`;
    return `<div class="repo" data-href="${href}">
      <div><div class="nm">${this.esc(x.name)}${x.archived ? " (归档)" : ""}${x.private ? " (私有)" : ""}</div>${desc}</div>
      <div class="meta">${lang}</div>
      <div class="meta">★${x.stargazers_count ?? 0} ⑂${x.forks_count ?? 0}<br>提交 ${x.commits30d ?? 0} / 30d<br>${relTime(x.updated_at ?? "")}</div>
    </div>`;
  }
  private esc(v: string): string { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string); }
  private langColor(l: string): string {
    const map: Record<string, string> = { TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5", HTML: "#e34c26", CSS: "#563d7c", Vue: "#41b883", Go: "#00ADD8", Rust: "#dea584", "C++": "#f34b7d", Shell: "#89e051" };
    return map[l] ?? "#9aa0a7";
  }
}

// ============ 仓库详情面板 ============
export class GithubRepoDetailPanel extends HTMLElement {
  connectedCallback(): void { this.attachShadow({ mode: "open" }); void this.render(); }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    const name = new URLSearchParams(location.hash.split("?")[1] ?? "").get("name") ?? "";
    s.innerHTML = `<style>${CSS}</style><h1>仓库动态</h1><p class="desc">加载中…</p>`;
    if (!(await guard()).connected) return;
    if (!name) { s.innerHTML = `<style>${CSS}</style><div class="empty">缺少仓库名。</div>`; return; }
    const [owner, repo] = name.split("/");
    const items = (await api<{ items?: any[] }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/events`)).items ?? [];
    const pushList = items.filter((e) => e.type === "PushEvent");
    let commits = 0; for (const e of pushList) commits += (e.payload?.distinct_size ?? 0);
    s.innerHTML = `<style>${CSS}</style>
      <div style="display:flex;align-items:baseline;gap:10px"><h1>${this.esc(name)}</h1><a href="https://github.com/${this.esc(name)}" target="_blank" rel="noreferrer noopener" style="color:var(--yellow,#fff44f);font-size:12px">打开 ↗</a></div>
      <p class="desc">近 30 天提交 <b style="color:var(--yellow,#fff44f)">${commits}</b> 次 · 共 ${items.length} 条事件</p>
      <ul class="tl" id="tl"></ul>`;
    const ul = s.getElementById("tl")!;
    if (!items.length) { ul.innerHTML = `<div class="empty">（近期无动态）</div>`; return; }
    ul.innerHTML = items.map((e) => {
      const t = classify(e.type);
      const icon = ICONS[t] ?? ICONS.other;
      const commitsHtml = t === "push" && Array.isArray(e.payload?.commits)
        ? e.payload.commits.map((c: any) => `<p class="commit"><b>${this.esc(String(c.sha ?? "").slice(0, 7))}</b> ${this.esc((c.message ?? "").split("\n")[0])}</p>`).join("")
        : "";
      return `<li>
        <div class="dot"><svg viewBox="0 0 24 24" fill="currentColor">${icon}</svg></div>
        <div><h4><b style="color:var(--yellow,#fff44f)">${this.esc(e.actor?.login ?? "?")}</b> · ${this.esc(oneLine(e))}</h4>${commitsHtml}</div>
        <time>${relTime(e.created_at ?? "")}</time>
      </li>`;
    }).join("");
  }
  private esc(v: string): string { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string); }
}
```

- [ ] **Step 2: 改 client/index.ts（注册组件 + render 注册表）**

```ts
// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import { GithubAuthPanel, GithubReposPanel, GithubRepoDetailPanel } from "./components.js";

modules.register("plugin-github", () => ({
  name: "plugin-github",
  inject: [],
  provide: [],
  apply(ctx: unknown) {
    if (!customElements.get("github-auth-panel")) customElements.define("github-auth-panel", GithubAuthPanel);
    if (!customElements.get("github-repos-panel")) customElements.define("github-repos-panel", GithubReposPanel);
    if (!customElements.get("github-repo-detail-panel")) customElements.define("github-repo-detail-panel", GithubRepoDetailPanel);
    // 面板注册：kind → 标签名（壳查 render 注册表渲染，不硬编码）
    try {
      const r = (ctx as any).services.get("render");
      r.register("github-auth-panel", "github-auth-panel");
      r.register("github-repos-panel", "github-repos-panel");
      r.register("github-repo-detail-panel", "github-repo-detail-panel");
    } catch { /* noop */ }
  },
}));
```

- [ ] **Step 3: 更新 client/types.d.ts**

```ts
export {};
```

- [ ] **Step 4: 构建验证**

Run: `pnpm --filter @vibepm/plugin-github run build && pnpm run lint`
Expected: 无 TS/构建错误，`client-dist/client.js` 产出。

- [ ] **Step 5: 提交**

```bash
git add packages/plugin-github
git commit -m "feat(github): client 三面板（认证/列表/详情）+ 路由守卫 + render 注册"
```

---

### Task 6: 替换接入（runtime bundles）+ 删旧包 + 清理

**Files:**
- Modify: `packages/cli/src/runtime.ts`
- Delete: `packages/plugin-github-auth/`（整个目录）
- Delete: `packages/plugin-repo-feed/`（整个目录）
- Modify: `pnpm-lock.yaml`（pnpm install 自动更新）

- [ ] **Step 1: 改 DEFAULT_BUNDLES**

`packages/cli/src/runtime.ts` 的 minimal 数组：删除 `"plugin-github-auth"` 与 `"plugin-repo-feed"`，插入 `"plugin-github"`（保持 settings 前、顺序语义不变）：

```ts
export const DEFAULT_BUNDLES: Record<string, string[]> = {
  minimal: [
    "plugin-storage",
    "plugin-web-ui",
    "plugin-ide-view",
    "plugin-onboarding",
    "plugin-github",
    "plugin-settings",
    "plugin-plugin-manager",
    "plugin-ambient",
  ],
};
```

- [ ] **Step 2: 删除旧包目录**

Run: `git rm -r packages/plugin-github-auth packages/plugin-repo-feed`
Expected: 两个目录与内容删除（含 src/client/tsconfig/package.json）。

- [ ] **Step 3: 刷新 workspace 依赖与构建**

Run: `pnpm install`
Expected: lockfile 更新，移除 `@vibepm/plugin-github-auth` / `@vibepm/plugin-repo-feed` 引用。
Run: `pnpm run build`
Expected: 全仓构建通过，无引用旧包。

- [ ] **Step 4: 残留扫描（务必为 0）**

Run: 使用 Grep 工具扫描（pattern `plugin-github-auth|plugin-repo-feed|web-api/route|module-system\.js`，path 覆盖 `packages` 与 `examples`）
Expected: 无输出（旧包 id / 死链路 / 壳 URL import 全部清零）。若 `plugin-settings/src/index.ts` 等仅有文案提及（如"GitHub 用户名"），属正常文案，不改。

- [ ] **Step 5: 提交**

```bash
git add -A packages/cli/src/runtime.ts pnpm-lock.yaml
git commit -m "refactor(github): 接入 plugin-github，删除 plugin-github-auth / plugin-repo-feed，清理死链路与壳 URL import"
```

---

### Task 7: 真机验收（用户规则：必须真机验证通过方可宣告可用）

**Files:** 无（仅验证）

前置：确认本机 git 仓库在 `main` 干净；如需 Device Flow，先在 GitHub 创建 OAuth App 拿公开 `client_id` 并配置到 `~/.vibepm/vibepm.json` 的 `github.client_id`。

- [ ] **Step 1: gh CLI 直连**

Run: 先 `pnpm --filter @vibepm/cli run build`，再 `vibepm web --next`（全局启动器 vibepm.cmd 指向 `packages/cli/dist/bin.js`）。确认本机 `gh auth status` 已登录。
Expected: 进 `#repos` 自动 connected（守卫放行，无跳转），列表出现分区（活跃区在上、尘封区默认折叠），行含「近 30 天提交 N 次」。

- [ ] **Step 2: 分区正确性**

Expected: 近 30 天提交 > 60 的仓库在活跃区、其余在尘封区；提交数文案与实际 events 一致；点击尘封区头可展开。

- [ ] **Step 3: 仓库详情 + commits**

Expected: 点仓库行进 `#repo?name=owner/repo`，meta 条 + 动态 timeline；push 事件展开 commit subject 列表（短 sha + 标题），无文件 diff；PR/issue/release 正常渲染。

- [ ] **Step 4: 无 gh 场景 → Device Flow**

临时把 `gh` 从 PATH 移除或改名 → 进 `#repos` 被强制跳 `#auth` → 点「通过浏览器授权」→ 显示授权码 + 链接 → 浏览器授权 → 自动轮询成功 → 返回 `#repos` 正常。
Expected: 全程无手动填 token；授权后 `#auth` 只显示状态条（来源 device），表单折叠。

- [ ] **Step 5: PAT 兜底**

Expected: `#auth` 展开手动表单，填 username + classic token（scope repo + read:user + read:org）→ 连接成功 → 列表/详情正常；状态条来源 pat。

- [ ] **Step 6: 退出与守卫复位**

Expected: `#auth` 点退出 → token/username/source 清空（settings 表核对）→ 再进 `#repos` 强制跳 `#auth`。

- [ ] **Step 7: 无残留与插件管理**

Expected: `#plugins` 列表只有 `plugin-github`（无 github-auth / repo-feed）；全仓无 `ctx.on("web-api/route")`、无 `/plugins/plugin-ide-view/module-system.js` import。服务日志无 webServer 路由冲突（`duplicate route` 报错）。

- [ ] **Step 8: 提交验收（如需）**

确认全部通过后：`git log --oneline` 呈现 plugin-github 相关提交；向用户宣告可用。

---

## 影响面核对（对照设计文档 §5）

| 设计文档影响面 | 实现任务 |
| --- | --- |
| 1. 新建 packages/plugin-github | Task 1–5 |
| 2. runtime bundles 替换 | Task 6 Step 1（注意：实际位置是 `packages/cli/src/runtime.ts`，非 core/loader.ts） |
| 3. plugin-manager 元数据 | 已目录动态化，**无需改** |
| 4. 壳 ide-view | 已数据驱动，**无需改** |
| 5. 删两目录 | Task 6 Step 2 |
| 6. workspace/tsconfig 清理 | Task 6 Step 3（pnpm install + build） |
| 7. onboarding | 注释级提及，不动 |
| 8. 旧遗留清理（死链路 / 壳 URL import） | Task 6 Step 4 |

## 风险

- Device Flow 需真实 OAuth App `client_id`；未配置时 start 返回明确提示，功能降级为 gh/PAT。
- GitHub Events API 90 天 / 300 条上限：提交数统计为「近 30 天可见范围」，UI 已标"近 30 天提交"。
- `/repos` 聚合 N+1 请求：并发 5 + TTL 缓存（cache_ttl 60s）压限流；单仓失败跳过。
- gh CLI 每次 `/status` 实时解析：gh 未登录时开销可忽略；PAT/Device 走 settings。
