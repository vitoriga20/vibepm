/**
 * plugin-repo-feed
 *  - inject github → /api/feed 拉 received_events（或 /user/received_events/public 作为降级），
 *    转换为 timeline items（icon / title / repo / when）。
 *  - slots.register shell.primary → 面板 route=#feed。
 */
import type { Context } from "@vibepm/core";
import { sendJson, type ApiRouteCtx } from "@vibepm/plugin-web-ui";
import type { SlotName, SlotService } from "@vibepm/plugin-ide-view";
import type { GitHubService } from "@vibepm/plugin-github-auth";

// timeline item 类型（对齐 client 渲染）
export type FeedItem = {
  id: string;
  type: "push" | "pr" | "issue" | "release" | "star" | "fork" | "create" | "watch" | "other";
  icon: string;          // feed icons 枚举名
  actor: string;         // login
  title: string;         // HTML-free，给 client 直接文本
  repo: string;
  repo_url: string;
  created_at: string;    // ISO
  raw: any;              // 原始 event payload（排障用；前端不用渲染 raw）
};

function classify(type: string): FeedItem["type"] {
  switch (type) {
    case "PushEvent": return "push";
    case "PullRequestEvent": return "pr";
    case "IssuesEvent": return "issue";
    case "ReleaseEvent": return "release";
    case "WatchEvent": return "watch";
    case "ForkEvent": return "fork";
    case "CreateEvent": return "create";
    case "StarEvent": return "star";
    default: return "other";
  }
}
function iconFor(t: FeedItem["type"]): string {
  // icons 名要匹配 client 枚举：feed 面板自绘 SVG（不依赖全局图标库）
  switch (t) {
    case "push": return "push";
    case "pr": return "pr";
    case "issue": return "issue";
    case "release": return "release";
    case "star": return "star";
    case "fork": return "fork";
    case "create": return "create";
    case "watch": return "watch";
    default: return "other";
  }
}
function oneLine(e: any): string {
  try {
    const p: any = e.payload ?? {};
    switch (e.type) {
      case "PushEvent": {
        const n = p.distinct_size ?? p.commits?.length ?? 0;
        const head = p.commits?.[0]?.message?.split("\n")[0] ?? "";
        return `推送 ${n} 个提交${head ? " · " + head : ""}`;
      }
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

function normalizeEvents(evs: any[]): FeedItem[] {
  return (Array.isArray(evs) ? evs : []).slice(0, 60).map((e, i) => ({
    id: String(e.id ?? `${e.created_at}-${i}`),
    type: classify(e.type),
    icon: iconFor(classify(e.type)),
    actor: e.actor?.login ?? "?",
    title: oneLine(e),
    repo: e.repo?.name ?? "?",
    repo_url: `https://github.com/${e.repo?.name ?? ""}`,
    created_at: e.created_at ?? new Date().toISOString(),
    raw: e,
  }));
}

class RepoFeedPlugin {
  name = "plugin-repo-feed";
  provide: string[] = [];
  inject = ["github", "slots"] as const;

  apply(ctx: Context): () => void {
    const gh = ctx.get("github") as any as GitHubService;
    const slots = ctx.get("slots") as any as SlotService;
    const disposers: Array<() => void> = [];

    // --- API ---
    // 注：web-api/route 是 bail 事件，listener 必须同步；异步工作用 IIFE + sync return true。
    const off = ctx.on("web-api/route", (rctx: ApiRouteCtx): boolean | undefined => {
      if (!rctx.path.startsWith("/api/feed")) return;
      if (rctx.req.method !== "GET") { sendJson(rctx.res, 405, { ok: false, reason: "method not allowed" }); return true; }
      if (!gh.token()) { sendJson(rctx.res, 200, { ok: false, connected: false, items: [] }); return true; }
      void (async () => {
        try {
          // 查询参数：?per_page=30 ；默认 30
          const per = Number(rctx.url.searchParams.get("per_page") ?? 30);
          const page = Number(rctx.url.searchParams.get("page") ?? 1);
          const username = gh.username() ?? (await gh.me())?.login;
          if (!username) { sendJson(rctx.res, 200, { ok: false, reason: "no username" }); return; }
          const data = await gh.fetchJson(
            `/users/${encodeURIComponent(username)}/received_events?per_page=${Math.min(per, 100)}&page=${Math.max(page, 1)}`,
            { timeoutMs: 20000 },
          );
          sendJson(rctx.res, 200, { ok: true, connected: true, items: normalizeEvents(data) });
        } catch (e) {
          sendJson(rctx.res, 502, { ok: false, reason: (e as Error).message, items: [] });
        }
      })();
      return true;
    });
    disposers.push(off as () => void);

    disposers.push(slots.register("shell.primary", {
      id: "feed/panel",
      label: "仓库动态",
      order: 30,
      payload: {
        kind: "feed-panel",
        title: "仓库动态",
        desc: "received_events（关注的仓库最近的 push / PR / issue / release / star / fork…）",
        route: "feed",
      },
    }));
    return () => { for (const f of disposers.reverse()) try { f(); } catch { /* noop */ } };
  }
}

export const PLUGIN = new RepoFeedPlugin();
