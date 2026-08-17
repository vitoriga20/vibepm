// ide-view 插件 Node 半：注册 IDE 布局默认 slots 条目
// 对齐 dsh：插件不渲染 UI，只往 slots 注册表塞"该 slot 有什么条目"；
// Web Components（client 半）读 slots 快照渲染每个区域。
import type { Context, SlotService } from "@vibepm/core";

class IdeViewPlugin {
  name = "plugin-ide-view";
  provide = [];
  inject = ["slots", "db", "webApp"];
  // dsh.client manifest 在 package.json

  apply(ctx: Context): () => void {
    const slots = ctx.get("slots") as SlotService;
    const disposers: Array<() => void> = [];

    // ---- Activity Bar（左侧 48px 图标条）----
    // 图标用约定名，前端 WC 按 icon 名渲染对应 SVG line 几何
    disposers.push(slots.register("activity-bar", { id: "explorer",   label: "项目资源", icon: "explorer",   order: 10, payload: { targetPanel: "projects" } }));
    disposers.push(slots.register("activity-bar", { id: "search",     label: "搜索",     icon: "search",     order: 20, payload: { targetPanel: "search"   } }));
    disposers.push(slots.register("activity-bar", { id: "source",     label: "同步状态", icon: "git",        order: 30, payload: { targetPanel: "source"   } }));
    disposers.push(slots.register("activity-bar", { id: "todos",      label: "任务清单", icon: "checklist",  order: 40, payload: { targetPanel: "todos"    } }));
    disposers.push(slots.register("activity-bar", { id: "account",    label: "账户",     icon: "person",     order: 999, payload: { targetPanel: "account"  } }));

    // ---- Sidebar Panels（左树侧栏）----
    disposers.push(slots.register("sidebar-panels", { id: "projects", label: "项目资源", icon: "explorer",  order: 10, payload: { activityId: "explorer" } }));
    disposers.push(slots.register("sidebar-panels", { id: "search",   label: "搜索",     icon: "search",    order: 20, payload: { activityId: "search"   } }));
    disposers.push(slots.register("sidebar-panels", { id: "source",   label: "同步状态", icon: "git",       order: 30, payload: { activityId: "source"   } }));
    disposers.push(slots.register("sidebar-panels", { id: "todos",    label: "任务清单", icon: "checklist", order: 40, payload: { activityId: "todos"    } }));

    // ---- Top bar right（顶部栏右侧操作按钮）----
    disposers.push(slots.register("topbar-right", { id: "connect", label: "连接 GitHub", icon: "link",   order: 20, payload: { action: "connect-github" } }));
    disposers.push(slots.register("topbar-right", { id: "sync",    label: "同步",         icon: "refresh",order: 10, payload: { action: "sync" } }));

    // ---- Top bar menu（顶部左侧菜单）----
    disposers.push(slots.register("topbar-menu", { id: "file",   label: "文件",  order: 10 }));
    disposers.push(slots.register("topbar-menu", { id: "edit",   label: "编辑",  order: 20 }));
    disposers.push(slots.register("topbar-menu", { id: "view",   label: "视图",  order: 30 }));
    disposers.push(slots.register("topbar-menu", { id: "tools",  label: "工具",  order: 40 }));
    disposers.push(slots.register("topbar-menu", { id: "help",   label: "帮助",  order: 99 }));

    // ---- Main Tabs（主编区顶部 tabs）----
    disposers.push(slots.register("main-tabs", { id: "overview", label: "概览",    order: 10, payload: { widget: "project-overview" } }));
    disposers.push(slots.register("main-tabs", { id: "plan",     label: "计划",    order: 20, payload: { widget: "project-plan"     } }));
    disposers.push(slots.register("main-tabs", { id: "fields",   label: "字段",    order: 30, payload: { widget: "project-fields"   } }));
    disposers.push(slots.register("main-tabs", { id: "notes",    label: "备注",    order: 40, payload: { widget: "project-notes"    } }));

    // ---- Right Panels（右侧面板）----
    disposers.push(slots.register("right-panels", { id: "stats",      label: "统计",     order: 10, payload: { widget: "project-stats"  } }));
    disposers.push(slots.register("right-panels", { id: "timeline",   label: "时间线",   order: 20, payload: { widget: "project-timeline" } }));

    // ---- Status bar（底部）----
    disposers.push(slots.register("statusbar-left",  { id: "conn-state", label: "未连接 GitHub", order: 10, payload: { kind: "conn-state"  } }));
    disposers.push(slots.register("statusbar-left",  { id: "db-path",    label: "~/.vibepm",       order: 20, payload: { kind: "db-path"     } }));
    disposers.push(slots.register("statusbar-right", { id: "rev",        label: "vibepm 0.1.0",    order: 90, payload: { kind: "version"     } }));
    disposers.push(slots.register("statusbar-right", { id: "port",       label: "-port-",          order: 80, payload: { kind: "listen-port", id: "port-placeholder" } }));

    return () => { for (const off of disposers.reverse()) try { off(); } catch { /* noop */ } };
  }
}

export const PLUGIN = new IdeViewPlugin();
