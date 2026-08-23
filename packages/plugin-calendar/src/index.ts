/**
 * plugin-calendar: Node 半
 *  - inject todoTimer（番茄钟数据服务，plugin-todo-timer provide）+ slots
 *    —— 内核 Fiber 反应式解析：todoTimer 挂出后本插件才 apply，顺序无需人工保障
 *  - inject 数据不落库不缓存：每个请求现场聚合（todoTimer 服务内部已持有快照，聚合是纯函数）
 *  - slots：shell.primary 挂「活动日历」面板（#calendar 路由）+ shell.nav 入口卡
 */
import type { Context } from "@vitoriga20/core";
import type { SlotService } from "@vitoriga20/plugin-ide-view";
import { sendJson, type WebServerService } from "@vitoriga20/plugin-web-ui";
import { TODO_TIMER_SERVICE } from "@vitoriga20/plugin-todo-timer";
import type { TodoTimerService } from "@vitoriga20/plugin-todo-timer";
import { CALENDAR_API_PATH } from "./api.js";

class CalendarPlugin {
  name = "plugin-calendar";
  provide: string[] = [];
  inject = ["slots", TODO_TIMER_SERVICE] as const;

  apply(ctx: Context): () => void {
    const slots = ctx.get("slots") as any as SlotService;
    const todo = ctx.get(TODO_TIMER_SERVICE) as TodoTimerService;
    const disposers: Array<() => void> = [];

    // --- 数据 API：todoTimer 聚合的日历投影（面板轮询此端点，实现不刷新即更新）---
    const registerApi = (): Array<() => void> => {
      if (!ctx.has("webServer")) return [];
      const ws = ctx.get("webServer") as WebServerService;
      const offs: Array<() => void> = [];
      offs.push(ws.register({ kind: "exact", path: CALENDAR_API_PATH, handler: (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") { sendJson(res, 405, { ok: false }); return; }
        const d = todo.getDistribution();
        sendJson(res, 200, { ok: true, ...d });
      }}));
      return offs;
    };
    let apiOffs: Array<() => void> = registerApi();
    const onWs = (): void => { if (!apiOffs.length && ctx.has("webServer")) apiOffs = registerApi(); };
    ctx.onUpdate("webServer", onWs);

    // --- 主面板：shell.primary（路由 #calendar）---
    disposers.push(slots.register("shell.primary", {
      id: "calendar/panel",
      label: "活动日历",
      order: 45,
      payload: {
        kind: "calendar-panel",
        icon: "calendar",
        title: "活动日历",
        desc: "专注时长 · 任务完成 · 长目标投入的多维度月视图（数据来自 TODO番茄钟）",
        route: "calendar",
      },
    }));

    // --- 首页导航卡：#calendar 入口 ---
    disposers.push(slots.register("shell.nav", {
      id: "calendar/nav",
      label: "活动日历",
      order: 45,
      payload: {
        kind: "nav-card",
        icon: "calendar",
        desc: "专注与任务的活动轨迹",
        hash: "#calendar",
        orderHint: 45,
      },
    }));

    return () => {
      ctx.removeUpdate(onWs);
      for (const off of apiOffs.reverse()) try { off(); } catch { /* noop */ }
      apiOffs = [];
      for (const off of disposers.reverse()) {
        try { off(); } catch { /* noop */ }
      }
    };
  }
}

export const PLUGIN = new CalendarPlugin();
