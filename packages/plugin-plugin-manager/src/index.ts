/**
 * plugin-plugin-manager: 设置里的「插件开关」面板（对齐 dsh 的 ui-settings-plugin-inventory）
 *
 * Node 端：
 *  - GET  /api/plugins           列出全部可见插件 + 启停状态 + 是否锁定
 *  - POST /api/plugins/:name     { enabled: boolean } 写 settings(plugins.enabled.<name>)
 *                                冷启动时 loader 据此跳过加载（dsh 等价：profile user-layer patch）
 *  - shell.primary 注册 plugin-manager-panel（route=plugins）
 *  - shell.nav 注册「插件管理」卡
 *
 * 「全部可见插件」来源 = enumerateAllEntries（workspace + 三方安装 + runtime 兜底，与 bootGraph 同一数据源）。
 * 壳插件列表（runtime.protected）在此处 locked，前端禁改。
 */
import type { Context } from "@vitoriga20/core";
import { PLUGINS_ENABLED_KEY, enumerateAllEntries, type EntryMeta } from "@vitoriga20/core";
import { readBody, sendJson, routeCtx, type WebServerService } from "@vitoriga20/plugin-web-ui";
import type { SlotService } from "@vitoriga20/plugin-ide-view";

type DbLike = {
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

/** entryId → 显示名：@scope/plugin-name → Plugin Name / plugin-xxx → Xxx */
function displayFromId(id: string): string {
  const raw = id.replace(/^@[^/]+\//, "").replace(/^plugin-/, "");
  return raw
    .split(/[-_]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ") || id;
}

/** 排序：壳插件在前（按运行时稳定序）→ 其余按 display 字母序 */
function sortEntries(rows: Array<EntryMeta & { locked: boolean }>, coreOrder: string[]): typeof rows {
  return [...rows].sort((a, b) => {
    const ai = coreOrder.indexOf(a.id);
    const bi = coreOrder.indexOf(b.id);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    const da = displayFromId(a.id);
    const db = displayFromId(b.id);
    return da.localeCompare(db);
  });
}

class PluginManagerPlugin {
  name = "plugin-plugin-manager";
  provide: string[] = [];
  inject = ["db", "slots", "webServer"] as const;

  apply(ctx: Context): () => void {
    const db = ctx.get("db") as any as DbLike;
    const slots = ctx.get("slots") as any as SlotService;
    const ws = ctx.get("webServer") as WebServerService;
    const disposers: Array<() => void> = [];
    // 运行时注入：壳插件列表与默认插件集由 config.vibepm.runtime 提供（内核不持有插件 id）
    const protectedSet = new Set<string>(
      Array.isArray(ctx.config?.vibepm?.runtime?.protected) ? ctx.config.vibepm.runtime.protected : [],
    );
    const runtimeBundles: string[] = Array.isArray(ctx.config?.vibepm?.runtime?.bundles?.minimal)
      ? ctx.config.vibepm.runtime.bundles.minimal
      : [];

    // 数据源改为「所有内核能识别的 entry」（workspace + 三方安装 + runtime 兜底），与 bootGraph 保持一致
    const readAllIds = (): Array<EntryMeta & { locked: boolean }> =>
      sortEntries(
        enumerateAllEntries(undefined, runtimeBundles).map((e) => ({ ...e, locked: protectedSet.has(e.id) })),
        [...protectedSet],
      );

    const readEnabledMap = (): Record<string, boolean> => {
      const m = db.getSetting<Record<string, boolean>>(PLUGINS_ENABLED_KEY);
      return m && typeof m === "object" ? m : {};
    };

    // --- API：webServer 命名路由（prefix /api/plugins）---
    const offRoute = ws.register({
      kind: "prefix",
      path: "/api/plugins",
      handler: (req, res) => {
        const rctx = routeCtx(req, res);
        const sub = rctx.path.slice("/api/plugins".length);

        // GET /api/plugins → 列表（目录动态生成：display 由 id 派生，desc 取各插件自声明 description）
        if ((sub === "" || sub === "/") && rctx.req.method === "GET") {
          const enabled = readEnabledMap();
          const all = readAllIds();
          const list = all.map((e) => ({
            name: e.id,
            pkgName: e.pkgName,
            display: displayFromId(e.id),
            desc: e.description ?? "—",
            locked: e.locked,
            enabled: e.locked ? true : !(enabled[e.id] === false),
          }));
          sendJson(rctx.res, 200, { ok: true, data: list });
          return;
        }
        // POST /api/plugins/:name { enabled } → 写 settings
        const m = sub.match(/^\/([^/]+)\/?$/);
        if (m && rctx.req.method === "POST") {
          const name = decodeURIComponent(m[1]);
          if (protectedSet.has(name)) {
            sendJson(rctx.res, 400, { ok: false, reason: "内核插件不可关闭" });
            return;
          }
          void (async () => {
            try {
              const body = await readBody(rctx.req);
              const target = Boolean(body.enabled === undefined ? true : body.enabled);
              const enabled = readEnabledMap();
              if (target) delete enabled[name];
              else enabled[name] = false;
              db.setSetting(PLUGINS_ENABLED_KEY, enabled);
              sendJson(rctx.res, 200, { ok: true, name, enabled: target, restarted: "冷启动生效：请重启内核" });
            } catch (e) {
              sendJson(rctx.res, 500, { ok: false, reason: (e as Error).message });
            }
          })();
          return;
        }
        sendJson(rctx.res, 404, { ok: false, reason: "not found" });
      },
    });
    disposers.push(offRoute);

    // --- 面板：#plugins ---
    disposers.push(slots.register("shell.primary", {
      id: "plugin-manager/panel",
      label: "插件管理",
      order: 40,
      payload: {
        kind: "plugin-manager-panel",
        icon: "plugins",
        title: "插件",
        desc: "启停插件，冷启动生效（重启内核后该插件的界面与后端一起消失/恢复）。内核三件套不可关。",
        route: "plugins",
      },
    }));

    // --- 导航卡 ---
    disposers.push(slots.register("shell.nav", {
      id: "plugin-manager/nav-card",
      label: "插件管理",
      order: 40,
      icon: "plugins",
      payload: {
        kind: "nav-card",
        icon: "plugins",
        desc: "设置里开关已加载插件",
        hash: "#plugins",
        state: "idle",
      },
    }));

    return () => { for (const off of disposers.reverse()) try { off(); } catch { /* noop */ } };
  }
}

export const PLUGIN = new PluginManagerPlugin();