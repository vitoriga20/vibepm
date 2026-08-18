/**
 * plugin-settings: Node 端
 *  - inject db → /api/settings (GET list / POST upsert / DELETE key)
 *  - inject slots → shell.primary 注册 settings 面板（#settings 路由）
 *  - shell.nav 注册一张「设置」快捷卡（onboarding 已经占了，这里可以不重复；仅加 primary 面板）
 */
import type { Context } from "@vibepm/core";
import { readBody, sendJson, type ApiRouteCtx } from "@vibepm/plugin-web-ui";
import type { SlotName, SlotService } from "@vibepm/plugin-ide-view";

type DbLike = {
  listSettings(): Record<string, unknown>;
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

class SettingsPlugin {
  name = "plugin-settings";
  provide: string[] = [];
  inject = ["db", "slots"] as const;

  apply(ctx: Context): () => void {
    const db = ctx.get("db") as any as DbLike;
    const slots = ctx.get("slots") as any as SlotService;
    const disposers: Array<() => void> = [];

    // --- HTTP 路由扩展（靠 web-api/route 事件）---
    // 注：web-api/route 是 bail 事件（见 core EventBus.bail），listener 必须同步！
    //     所以遇到需要异步的（如 readBody），我们启动 IIFE 并同步返回 true。
    const offRoute = ctx.on("web-api/route", (rctx: ApiRouteCtx): boolean | undefined => {
      if (!rctx.path.startsWith("/api/settings")) return;
      const sub = rctx.path.slice("/api/settings".length);
      // GET /api/settings → list all
      if ((sub === "" || sub === "/") && rctx.req.method === "GET") {
        sendJson(rctx.res, 200, { ok: true, data: db.listSettings() });
        return true;
      }
      // GET /api/settings/:key
      const m = sub.match(/^\/([^/]+)\/?$/);
      if (m && rctx.req.method === "GET") {
        sendJson(rctx.res, 200, { ok: true, key: m[1], value: db.getSetting(m[1]) });
        return true;
      }
      // POST /api/settings → upsert { key, value } | { batch: Record<string,unknown> }
      if ((sub === "" || sub === "/") && rctx.req.method === "POST") {
        void (async () => {
          try {
            const body = await readBody(rctx.req);
            if (body.batch && typeof body.batch === "object") {
              for (const [k, v] of Object.entries(body.batch)) db.setSetting(k, v);
              sendJson(rctx.res, 200, { ok: true, written: Object.keys(body.batch).length });
            } else if (typeof body.key === "string") {
              db.setSetting(body.key, body.value ?? null);
              sendJson(rctx.res, 200, { ok: true, key: body.key });
            } else {
              sendJson(rctx.res, 400, { ok: false, reason: "bad body: {key,value} or {batch}" });
            }
          } catch (e) {
            sendJson(rctx.res, 500, { ok: false, reason: (e as Error).message });
          }
        })();
        return true;
      }
      // DELETE /api/settings/:key
      if (m && rctx.req.method === "DELETE") {
        db.deleteSetting(m[1]);
        sendJson(rctx.res, 200, { ok: true, key: m[1] });
        return true;
      }
      return undefined;
    });
    disposers.push(offRoute as () => void);

    // --- 面板注册：shell.primary（路由 #settings）---
    disposers.push(slots.register("shell.primary", {
      id: "settings/panel",
      label: "设置",
      order: 20,
      payload: {
        kind: "settings-panel",
        title: "设置",
        desc: "所有配置均存在本地数据库（key-value JSON）。插件想存什么都直接走 settings API。",
        route: "settings",
      },
    }));

    // --- 首页导航卡：#settings 入口（本插件自注册，项随插件装卸而出现/消失，对齐 dsh）---
    disposers.push(slots.register("shell.nav", {
      id: "settings/nav",
      label: "偏好设置",
      order: 20,
      payload: {
        kind: "nav-card",
        icon: "settings",
        desc: "外观、默认工作目录、GitHub 用户名等（插件化、按需加字段）",
        hash: "#settings",
        orderHint: 20,
      },
    }));

    return () => { for (const off of disposers.reverse()) try { off(); } catch { /* noop */ } };
  }
}

export const PLUGIN = new SettingsPlugin();
