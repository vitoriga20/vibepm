/**
 * plugin-github · Node 侧：github service + 三源认证 + status/login/logout/device/repos API + 三页面槽位
 *  - 解耦后标准：webServer.register 前缀路由；不用旧 ctx.on("web-api/route")。
 *  - 阈值三级取值：settings 运行时键 > vibepm.json 配置 > 常量默认（见 thresholds()）。
 */
import type { Context } from "@vibepm/core";
import { readBody, sendJson, routeCtx, type WebServerService } from "@vibepm/plugin-web-ui";
import type { SlotService } from "@vibepm/plugin-ide-view";
import { GitHubService } from "./github-service.js";
import {
  API_PREFIX, R_SUB_STATUS, R_SUB_LOGIN, R_SUB_LOGOUT, R_SUB_REPOS, R_SUB_DEVICE_START, R_SUB_DEVICE_POLL,
  API_BASE, CACHE_TTL_S, ACTIVE_WINDOW_DAYS, ACTIVE_MIN_COMMITS, STATS_WINDOW_DAYS, REPO_PARALLEL,
  GH_DEVICE_CODE_URL, GH_ACCESS_TOKEN_URL, DEVICE_GRANT_TYPE, GH_SCOPE, JSON_ACCEPT, JSON_CONTENT_TYPE,
  DEVICE_POLL_INTERVAL_S, DEVICE_EXPIRES_IN_S, HTTP,
  HASH_AUTH, HASH_REPOS, HASH_REPO, PANEL_KIND_AUTH, PANEL_KIND_REPOS, PANEL_KIND_DETAIL,
  SLOT_AUTH, SLOT_AUTH_NAV, SLOT_REPOS, SLOT_REPOS_NAV, SLOT_DETAIL,
  TEXT_AUTH_TITLE, TEXT_AUTH_DESC, TEXT_AUTH_NAV_DESC, TEXT_REPOS_TITLE, TEXT_REPOS_DESC, TEXT_REPOS_NAV_DESC, TEXT_DETAIL_TITLE, TEXT_DETAIL_DESC,
  ERR_MSG_LOGIN_REQUIRED, ERR_MSG_DEVICE_CLIENT_ID, ERR_MSG_NOT_FOUND,
} from "./constants.js";
import {
  K_TOKEN, K_USERNAME, K_SOURCE, K_DEVICE_CODE, K_DEVICE_EXPIRES,
  K_ACTIVE_WINDOW_DAYS, K_ACTIVE_MIN_COMMITS, K_STATS_WINDOW_DAYS,
} from "./settings-keys.js";

type DbLike = {
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

/** 配置默认值唯一源 = src/constants.ts；合并短名（github）与 entry id（plugin-github）两层 */
type GithubConfig = {
  api_base: string;
  client_id: string;
  cache_ttl: number;
  active_window_days: number;
  active_min_commits: number;
  stats_window_days: number;
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

    const cfg: GithubConfig = {
      api_base: API_BASE,
      client_id: "",
      cache_ttl: CACHE_TTL_S,
      active_window_days: ACTIVE_WINDOW_DAYS,
      active_min_commits: ACTIVE_MIN_COMMITS,
      stats_window_days: STATS_WINDOW_DAYS,
      ...ctx.mergedConfig("github"),
      ...ctx.mergedConfig("plugin-github"),
    };
    const service = new GitHubService(db, cfg.api_base, cfg.cache_ttl * 1000);
    ctx.provide("github", service);

    // 阈值三级取值——settings 运行时键（UI「分区设置」改，立即生效）> vibepm.json 配置（mergedConfig，重启生效）> 常量默认。
    // 每次请求内现算（db.getSetting 实时读），阈值改动即时反映，无需重启；活跃判据保持 n >= activeMinCommits（≥）。
    const thresholds = (): { activeWindowDays: number; activeMinCommits: number; statsWindowDays: number } => ({
      activeWindowDays: db.getSetting<number>(K_ACTIVE_WINDOW_DAYS) ?? cfg.active_window_days ?? ACTIVE_WINDOW_DAYS,
      activeMinCommits: db.getSetting<number>(K_ACTIVE_MIN_COMMITS) ?? cfg.active_min_commits ?? ACTIVE_MIN_COMMITS,
      statsWindowDays: db.getSetting<number>(K_STATS_WINDOW_DAYS) ?? cfg.stats_window_days ?? STATS_WINDOW_DAYS,
    });

    // --- API：webServer 前缀路由（解耦后标准，不用旧 web-api/route）---
    disposers.push(ws.register({
      kind: "prefix",
      path: API_PREFIX,
      handler: (req, res) => {
        const rctx = routeCtx(req, res);
        const sub = rctx.path.slice(API_PREFIX.length) || "/";

        // GET /status —— 三源动态解析（gh 直连→gh；否则读 settings 的 source 键；不得只读 settings）
        if ((sub === R_SUB_STATUS || sub === R_SUB_STATUS + "/") && rctx.req.method === "GET") {
          void (async () => {
            try {
              const { source } = service.auth();
              const me = await service.me();
              if (!me) { sendJson(rctx.res, HTTP.OK, { ok: true, connected: false }); return; }
              sendJson(rctx.res, HTTP.OK, { ok: true, connected: true, source, username: me.login, me });
            } catch (e) { sendJson(rctx.res, HTTP.OK, { ok: false, connected: false, reason: (e as Error).message }); }
          })();
          return;
        }

        // POST /login（PAT 兜底）
        if ((sub === R_SUB_LOGIN || sub === R_SUB_LOGIN + "/") && rctx.req.method === "POST") {
          void (async () => {
            try {
              const body = await readBody(rctx.req);
              const username = String(body.username ?? "").trim();
              const token = String(body.token ?? "").trim();
              if (!username || !token) { sendJson(rctx.res, HTTP.BAD_REQUEST, { ok: false, reason: ERR_MSG_LOGIN_REQUIRED }); return; }
              db.setSetting(K_USERNAME, username);
              db.setSetting(K_TOKEN, token);
              db.setSetting(K_SOURCE, "pat");
              service.clearCache(); // 换 token → 旧指纹缓存作废
              const me = await service.me();
              if (me) db.setSetting(K_USERNAME, me.login); // 以 /user 返回的 login 为准
              sendJson(rctx.res, HTTP.OK, { ok: !!me, me: me ?? null });
            } catch (e) { sendJson(rctx.res, HTTP.OK, { ok: false, reason: (e as Error).message }); }
          })();
          return;
        }

        // POST /logout —— 清凭据 + device 残留 + 缓存
        if ((sub === R_SUB_LOGOUT || sub === R_SUB_LOGOUT + "/") && rctx.req.method === "POST") {
          db.deleteSetting(K_TOKEN);
          db.deleteSetting(K_USERNAME);
          db.deleteSetting(K_SOURCE);
          db.deleteSetting(K_DEVICE_CODE);   // 清 device 残留
          db.deleteSetting(K_DEVICE_EXPIRES);
          service.clearCache();
          sendJson(rctx.res, HTTP.OK, { ok: true });
          return;
        }

        // POST /device/start —— 发起 Device Flow
        if ((sub === R_SUB_DEVICE_START || sub === R_SUB_DEVICE_START + "/") && rctx.req.method === "POST") {
          void (async () => {
            try {
              const clientId = cfg.client_id ?? "";
              if (!clientId) {
                sendJson(rctx.res, HTTP.BAD_REQUEST, { ok: false, reason: ERR_MSG_DEVICE_CLIENT_ID });
                return;
              }
              const r = await fetch(GH_DEVICE_CODE_URL, {
                method: "POST",
                headers: { "Accept": JSON_ACCEPT, "Content-Type": JSON_CONTENT_TYPE },
                body: JSON.stringify({ client_id: clientId, scope: GH_SCOPE }),
              });
              const d = await r.json() as any;
              if (d.error) { sendJson(rctx.res, HTTP.BAD_GATEWAY, { ok: false, reason: d.error_description ?? d.error }); return; }
              // 存 device_code / expires 供 poll
              db.setSetting(K_DEVICE_CODE, String(d.device_code ?? ""));
              db.setSetting(K_DEVICE_EXPIRES, String(Date.now() + (Number(d.expires_in ?? DEVICE_EXPIRES_IN_S) * 1000)));
              sendJson(rctx.res, HTTP.OK, {
                ok: true,
                user_code: d.user_code,
                verification_uri: d.verification_uri,
                expires_in: d.expires_in,
                interval: d.interval ?? DEVICE_POLL_INTERVAL_S,
              });
            } catch (e) { sendJson(rctx.res, HTTP.BAD_GATEWAY, { ok: false, reason: (e as Error).message }); }
          })();
          return;
        }

        // POST /device/poll —— 轮询授权状态
        if ((sub === R_SUB_DEVICE_POLL || sub === R_SUB_DEVICE_POLL + "/") && rctx.req.method === "POST") {
          void (async () => {
            try {
              const clientId = cfg.client_id ?? "";
              const deviceCode = db.getSetting<string>(K_DEVICE_CODE);
              if (!clientId || !deviceCode) { sendJson(rctx.res, HTTP.BAD_REQUEST, { ok: false, status: "no_pending" }); return; }
              const expires = Number(db.getSetting<string>(K_DEVICE_EXPIRES) ?? 0);
              if (expires && Date.now() > expires) { sendJson(rctx.res, HTTP.OK, { ok: false, status: "expired" }); return; }
              const r = await fetch(GH_ACCESS_TOKEN_URL, {
                method: "POST",
                headers: { "Accept": JSON_ACCEPT, "Content-Type": JSON_CONTENT_TYPE },
                body: JSON.stringify({
                  client_id: clientId,
                  device_code: deviceCode,
                  grant_type: DEVICE_GRANT_TYPE,
                }),
              });
              const d = await r.json() as any;
              if (d.access_token) {
                db.deleteSetting(K_DEVICE_CODE);
                db.deleteSetting(K_DEVICE_EXPIRES);
                db.setSetting(K_TOKEN, String(d.access_token));
                db.setSetting(K_SOURCE, "device");
                db.setSetting(K_USERNAME, String((await service.me())?.login ?? ""));
                service.clearCache();
                sendJson(rctx.res, HTTP.OK, { ok: true, connected: true });
                return;
              }
              if (d.error === "authorization_pending" || d.error === "slow_down") { sendJson(rctx.res, HTTP.OK, { ok: false, status: "pending" }); return; }
              if (d.error === "expired_token") { sendJson(rctx.res, HTTP.OK, { ok: false, status: "expired" }); return; }
              if (d.error === "access_denied") { sendJson(rctx.res, HTTP.OK, { ok: false, status: "denied" }); return; }
              sendJson(rctx.res, HTTP.OK, { ok: false, status: "error", reason: d.error_description ?? d.error });
            } catch (e) { sendJson(rctx.res, HTTP.BAD_GATEWAY, { ok: false, status: "error", reason: (e as Error).message }); }
          })();
          return;
        }

        // GET /repos/:owner/:repo/events（单仓动态；TTL 缓存已在 service.repoEvents 内；窗口用三级取值后的 statsWindowDays）
        const evM = sub.match(new RegExp(`^${R_SUB_REPOS}/([^/]+)/([^/]+)/events/?$`));
        if (evM && rctx.req.method === "GET") {
          void (async () => {
            try {
              const owner = decodeURIComponent(evM[1]);
              const repo = decodeURIComponent(evM[2]);
              const [items, stats] = await Promise.all([
                service.repoEvents(owner, repo),
                service.commitStats(owner, repo, [thresholds().statsWindowDays]),
              ]);
              const th = thresholds();
              // 下发统计窗口 + 真实提交数（events 的 PushEvent 已无 commits 详情，提交数走 commits 接口）
              sendJson(rctx.res, HTTP.OK, { ok: true, items, commits: stats.counts[th.statsWindowDays] ?? 0, statsWindowDays: th.statsWindowDays });
            } catch (e) { sendJson(rctx.res, HTTP.BAD_GATEWAY, { ok: false, reason: (e as Error).message, items: [] }); }
          })();
          return;
        }

        // GET /repos（列表 + 提交频率 + 分区；聚合结果整体 TTL 缓存；?refresh=1 强刷；阈值三级取值后下发实际值）
        if ((sub === R_SUB_REPOS || sub === R_SUB_REPOS + "/") && rctx.req.method === "GET") {
          void (async () => {
            try {
              if (rctx.url.searchParams.get("refresh") === "1") service.clearCache(); // 强刷（含改阈值后 UI 触发）
              const aggKey = `repos:${service.tokenFingerprint()}`;
              const cached = service.cacheGet<any>(aggKey);
              if (cached) { sendJson(rctx.res, HTTP.OK, cached); return; }
              const th = thresholds();
              const repos = await service.listRepos();
              const withStats = repos.map((r) => ({ ...r, commits30d: 0, active: false, statsFailed: false, lastPushAt: null as string | null }));
              // 逐仓并行拉 events，并发上限 REPO_PARALLEL；单仓失败跳过并标记 statsFailed
              const pool: Promise<void>[] = [];
              const queue = [...withStats];
              for (let i = 0; i < Math.min(REPO_PARALLEL, queue.length); i++) {
                pool.push((async () => {
                  for (;;) {
                    const item = queue.shift();
                    if (!item) return;
                    const [owner, repo] = item.full_name.split("/");
                    try {
                      const st = await service.commitStats(owner, repo, [th.activeWindowDays, th.statsWindowDays]);
                      item.commits30d = st.counts[th.statsWindowDays] ?? 0;
                      item.active = (st.counts[th.activeWindowDays] ?? 0) >= th.activeMinCommits; // 活跃判据：≥（近 active_window_days 天，三级取值后实际值）
                      item.lastPushAt = st.lastCommitAt ?? null; // 列表「最近提交」列
                    } catch { item.statsFailed = true; }
                  }
                })());
              }
              await Promise.all(pool);
              // 活跃区、尘封区各自按提交数降序；活跃区在上
              const active = withStats.filter((r) => r.active).sort((a, b) => b.commits30d - a.commits30d);
              const dusty = withStats.filter((r) => !r.active).sort((a, b) => b.commits30d - a.commits30d);
              const payload = {
                ok: true, connected: true,
                repos: [...active, ...dusty],
                activeCount: active.length,
                dustyCount: dusty.length,
                // 下发三级取值后的实际生效值，前端据此动态拼「近 N 天提交 ≥ M 为活跃」文案
                activeWindowDays: th.activeWindowDays,
                activeMinCommits: th.activeMinCommits,
                statsWindowDays: th.statsWindowDays,
              };
              service.cacheSet(aggKey, payload); // 聚合结果 TTL 缓存
              sendJson(rctx.res, HTTP.OK, payload);
            } catch (e) { sendJson(rctx.res, HTTP.BAD_GATEWAY, { ok: false, reason: (e as Error).message }); }
          })();
          return;
        }

        sendJson(rctx.res, HTTP.NOT_FOUND, { ok: false, reason: ERR_MSG_NOT_FOUND });
      },
    }));

    // --- 面板 / 导航卡：三个页面槽（含详情面板）---
    disposers.push(slots.register("shell.primary", {
      id: SLOT_AUTH,
      label: TEXT_AUTH_TITLE,
      order: 10,
      payload: { kind: PANEL_KIND_AUTH, icon: "github", title: TEXT_AUTH_TITLE, desc: TEXT_AUTH_DESC, route: HASH_AUTH },
    }));
    disposers.push(slots.register("shell.nav", {
      id: SLOT_AUTH_NAV,
      label: TEXT_AUTH_TITLE,
      order: 10,
      payload: { kind: "nav-card", icon: "github", desc: TEXT_AUTH_NAV_DESC, hash: "#" + HASH_AUTH, orderHint: 10 },
    }));
    disposers.push(slots.register("shell.primary", {
      id: SLOT_REPOS,
      label: TEXT_REPOS_TITLE,
      order: 20,
      payload: { kind: PANEL_KIND_REPOS, icon: "git", title: TEXT_REPOS_TITLE, desc: TEXT_REPOS_DESC, route: HASH_REPOS },
    }));
    // 仓库 nav 卡 icon 用 settings（onboarding icons map 只有 github/settings/feed/help，无 repo，避免 fallback 成 help）
    disposers.push(slots.register("shell.nav", {
      id: SLOT_REPOS_NAV,
      label: TEXT_REPOS_TITLE,
      order: 20,
      payload: { kind: "nav-card", icon: "settings", desc: TEXT_REPOS_NAV_DESC, hash: "#" + HASH_REPOS, orderHint: 20 },
    }));
    // 详情面板：route=repo；缺失则 #repo?name=… 在 renderPrimary 中无匹配项，永不渲染
    disposers.push(slots.register("shell.primary", {
      id: SLOT_DETAIL,
      label: TEXT_DETAIL_TITLE,
      order: 30,
      payload: { kind: PANEL_KIND_DETAIL, title: TEXT_DETAIL_TITLE, desc: TEXT_DETAIL_DESC, route: HASH_REPO },
    }));

    return () => {
      for (const off of disposers.reverse()) try { off(); } catch { /* noop */ }
      if (ctx.has("github")) (ctx as any).unprovide?.("github");
    };
  }
}

export const PLUGIN = new GithubPlugin();
