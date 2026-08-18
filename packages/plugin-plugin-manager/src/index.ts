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
import type { Context } from "@vibepm/core";
import { PLUGINS_ENABLED_KEY, enumerateAllEntries, type EntryMeta } from "@vibepm/core";
import { readBody, sendJson, routeCtx, type WebServerService } from "@vibepm/plugin-web-ui";
import type { SlotService } from "@vibepm/plugin-ide-view";

type DbLike = {
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

/**
 * 官方插件 display/描述（优先于 package.json.description）。
 * 新的官方插件可加这里；第三方/没写的自动走 fallback。
 */
const PLUGIN_META: Record<string, { display: string; desc: string }> = {
  "plugin-storage": { display: "Storage", desc: "本地 SQLite 数据库（设置/项目/同步元数据）" },
  "plugin-web-ui": { display: "Web UI", desc: "内置 HTTP 服务器与静态壳（页面入口）" },
  "plugin-ide-view": { display: "Shell", desc: "极简单壳容器（header/nav/面板/底栏）" },
  "plugin-onboarding": { display: "Onboarding", desc: "首屏引导：连接 GitHub / 打开设置 / 查看动态" },
  "plugin-github-auth": { display: "GitHub", desc: "GitHub PAT 连接与用户态校验" },
  "plugin-settings": { display: "Settings", desc: "通用设置面板（键值存储）" },
  "plugin-repo-feed": { display: "Feed", desc: "仓库动态 / received_events 列表" },
  "plugin-plugin-manager": { display: "插件管理", desc: "本面板：设置里开关插件（冷启动生效）" },
  "plugin-skin-rhine": { display: "终末地皮肤", desc: "莱茵科技风格皮肤（暗墨蓝金属 + 柠檬黄光；组合层覆盖 --skin-* token）" },
  "plugin-ambient": { display: "Ambient", desc: "主区背景科技球 + 氛围动画（纯装饰）" },
};

/** entryId → 显示名 fallback：@scope/plugin-name → Plugin Name / plugin-xxx → Xxx */
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

        // GET /api/plugins → 列表
        if ((sub === "" || sub === "/") && rctx.req.method === "GET") {
          const enabled = readEnabledMap();
          const all = readAllIds();
          const list = all.map((e) => {
            const meta = PLUGIN_META[e.id];
            return {
              name: e.id,
              pkgName: e.pkgName,
              display: meta?.display ?? displayFromId(e.id),
              desc: meta?.desc ?? e.description ?? "—",
              locked: e.locked,
              enabled: e.locked ? true : !(enabled[e.id] === false),
            };
          });
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