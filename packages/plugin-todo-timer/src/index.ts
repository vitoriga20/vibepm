/**
 * plugin-todo-timer: Node 半
 *  - inject slots → shell.primary 注册 TODO番茄钟面板（#todo-timer 路由）
 *  - shell.nav 注册一张「TODO番茄钟」入口卡
 *  - provide todoTimer → 番茄钟数据服务化（快照/统计/日分布聚合），供消费插件 inject
 *  - 数据来源：壳侧桥（client 半）POST /api/todo-timer/sync 上报的 TaskList 整包快照
 */
import type { Context } from "@vitoriga20/core";
import type { SlotService } from "@vitoriga20/plugin-ide-view";
import { sendJson, readBody, routeCtx, type WebServerService } from "@vitoriga20/plugin-web-ui";
import { TodoTimerService } from "./service.js";
import {
  TODO_TIMER_SERVICE, SYNC_API_PATH, SNAPSHOT_API_PATH, isTaskListLike,
} from "./contract.js";

// 服务与契约类型一并导出：消费插件（plugin-calendar）从本包取类型与常量，不另写字面量
export { TodoTimerService } from "./service.js";
export * from "./contract.js";

class TodoTimerPlugin {
  name = "plugin-todo-timer";
  provide: string[] = [TODO_TIMER_SERVICE];
  inject = ["slots"] as const;

  apply(ctx: Context): () => void {
    const slots = ctx.get("slots") as any as SlotService;
    const disposers: Array<() => void> = [];

    // --- 数据服务：todoTimer（快照缓存 + 聚合），先于 API 挂出，消费方反应式接入 ---
    const svc = new TodoTimerService();
    ctx.provide(TODO_TIMER_SERVICE, svc);

    // --- 上报/查询 API（web-ui 可能晚于本插件加载 → onUpdate 等它出现再注册，同 plugin-storage 范式）---
    const registerApi = (): Array<() => void> => {
      if (!ctx.has("webServer")) return [];
      const ws = ctx.get("webServer") as WebServerService;
      const offs: Array<() => void> = [];
      offs.push(ws.register({ kind: "exact", path: SYNC_API_PATH, handler: (req, res) => {
        if (req.method !== "POST") { sendJson(res, 405, { ok: false, reason: "POST only" }); return; }
        void (async () => {
          const body = await readBody(req);
          const payload = (body as { payload?: unknown }).payload ?? body;
          if (!isTaskListLike(payload)) {
            sendJson(res, 400, { ok: false, reason: "payload 不是 TaskList（缺 statistics/current/done/archived）" });
            return;
          }
          svc.ingest(payload);
          sendJson(res, 200, { ok: true, updatedAt: svc.updatedAt });
        })();
      }}));
      offs.push(ws.register({ kind: "exact", path: SNAPSHOT_API_PATH, handler: (_req, res) => {
        sendJson(res, 200, {
          ok: true,
          updatedAt: svc.updatedAt,
          distribution: svc.getDistribution(),
          taskStats: svc.getTaskStats(),
          statisticsCount: svc.getStatistics().length,
        });
      }}));
      return offs;
    };
    let apiOffs: Array<() => void> = registerApi();
    const onWs = (): void => { if (!apiOffs.length && ctx.has("webServer")) apiOffs = registerApi(); };
    ctx.onUpdate("webServer", onWs);

    // --- 主面板：shell.primary（路由 #todo-timer）---
    disposers.push(slots.register("shell.primary", {
      id: "todo-timer/panel",
      label: "TODO番茄钟",
      order: 40,
      payload: {
        kind: "todo-timer-panel",
        icon: "checklist",
        title: "TODO番茄钟",
        desc: "番茄钟 + ToDo 小目标管理：专注计分、长目标标签、跨天归档、统计日历",
        route: "todo-timer",
      },
    }));

    // --- 首页导航卡：#todo-timer 入口 ---
    disposers.push(slots.register("shell.nav", {
      id: "todo-timer/nav",
      label: "TODO番茄钟",
      order: 40,
      payload: {
        kind: "nav-card",
        icon: "checklist",
        desc: "番茄钟 + 小目标 ToDo",
        hash: "#todo-timer",
        orderHint: 40,
      },
    }));

    return () => {
      ctx.removeUpdate(onWs);
      for (const off of apiOffs.reverse()) try { off(); } catch { /* noop */ }
      apiOffs = [];
      if (ctx.has(TODO_TIMER_SERVICE)) ctx.unprovide(TODO_TIMER_SERVICE);
      for (const off of disposers.reverse()) {
        try { off(); } catch { /* noop */ }
      }
    };
  }
}

export const PLUGIN = new TodoTimerPlugin();
