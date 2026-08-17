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
 * 「全部可见插件」来源 = DEFAULT_BUNDLES.minimal 全集（与 loader 同一数据源，天然一致）。
 * PROTECTED_CORE(三件套) 在此处 locked，前端禁改。
 */
import type { Context } from "@vibepm/core";
import { DEFAULT_BUNDLES, PROTECTED_CORE, PLUGINS_ENABLED_KEY } from "@vibepm/core";
import { readBody, sendJson, type ApiRouteCtx } from "@vibepm/plugin-web-ui";
import type { SlotService } from "@vibepm/plugin-ide-view";

type DbLike = {
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

/** 可见插件描述表：name → 展示名/一句话描述 */
const PLUGIN_META: Record<string, { display: string; desc: string }> = {
  "plugin-storage": { display: "Storage", desc: "本地 SQLite 数据库（设置/项目/同步元数据）" },
  "plugin-web-ui": { display: "Web UI", desc: "内置 HTTP 服务器与静态壳（页面入口）" },
  "plugin-ide-view": { display: "Shell", desc: "极简单壳容器（header/nav/面板/底栏）" },
  "plugin-onboarding": { display: "Onboarding", desc: "首屏引导：连接 GitHub / 打开设置 / 查看动态" },
  "plugin-github-auth": { display: "GitHub", desc: "GitHub PAT 连接与用户态校验" },
  "plugin-settings": { display: "Settings", desc: "通用设置面板（键值存储）" },
  "plugin-repo-feed": { display: "Feed", desc: "仓库动态 / received_events 列表" },
  "plugin-plugin-manager": { display: "插件管理", desc: "本面板：设置里开关插件（冷启动生效）" },
};

class PluginManagerPlugin {
  name = "plugin-plugin-manager";
  provide: string[] = [];
  inject = ["db", "slots"] as const;

  apply(ctx: Context): () => void {
    const db = ctx.get("db") as any as DbLike;
    const slots = ctx.get("slots") as any as SlotService;
    const disposers: Array<() => void> = [];

    const allIds = Array.from(new Set(DEFAULT_BUNDLES.minimal));

    const readEnabledMap = (): Record<string, boolean> => {
      const m = db.getSetting<Record<string, boolean>>(PLUGINS_ENABLED_KEY);
      return m && typeof m === "object" ? m : {};
    };

    // --- API ---
    const offRoute = ctx.on("web-api/route", (rctx: ApiRouteCtx): boolean | undefined => {
      if (!rctx.path.startsWith("/api/plugins")) return;
      const sub = rctx.path.slice("/api/plugins".length);

      // GET /api/plugins → 列表
      if ((sub === "" || sub === "/") && rctx.req.method === "GET") {
        const enabled = readEnabledMap();
        const list = allIds.map((name) => {
          const meta = PLUGIN_META[name] ?? { display: name, desc: "" };
          return {
            name,
            display: meta.display,
            desc: meta.desc,
            locked: PROTECTED_CORE.has(name),
            enabled: PROTECTED_CORE.has(name) ? true : !(enabled[name] === false),
          };
        });
        sendJson(rctx.res, 200, { ok: true, data: list });
        return true;
      }
      // POST /api/plugins/:name { enabled } → 写 settings
      const m = sub.match(/^\/([^/]+)\/?$/);
      if (m && rctx.req.method === "POST") {
        const name = decodeURIComponent(m[1]);
        if (PROTECTED_CORE.has(name)) {
          sendJson(rctx.res, 400, { ok: false, reason: "内核插件不可关闭" });
          return true;
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
        return true;
      }
      return undefined;
    });
    disposers.push(offRoute as () => void);

    // --- 面板：#plugins ---
    disposers.push(slots.register("shell.primary", {
      id: "plugin-manager/panel",
      label: "插件管理",
      order: 40,
      payload: {
        kind: "plugin-manager-panel",
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