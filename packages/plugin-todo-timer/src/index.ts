/**
 * plugin-todo-timer: Node 半
 *  - inject slots → shell.primary 注册 TODO番茄钟面板（#todo-timer 路由）
 *  - shell.nav 注册一张「TODO番茄钟」入口卡
 *  - 页面数据走浏览器端 localStorage（预览壳自研存储），node 半不注册业务 API
 */
import type { Context } from "@vitoriga20/core";
import type { SlotService } from "@vitoriga20/plugin-ide-view";

class TodoTimerPlugin {
  name = "plugin-todo-timer";
  provide: string[] = [];
  inject = ["slots"] as const;

  apply(ctx: Context): () => void {
    const slots = ctx.get("slots") as any as SlotService;
    const disposers: Array<() => void> = [];

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
      for (const off of disposers.reverse()) {
        try { off(); } catch { /* noop */ }
      }
    };
  }
}

export const PLUGIN = new TodoTimerPlugin();
