/**
 * plugin-island-settings: Node 端
 *  - inject slots → shell.primary 注册岛设置面板（#island 路由）+ shell.nav 导航卡
 *  - 无独立存储：设置项经 Tauri 事件下发到岛窗（tauri://localhost origin，跨源读不到
 *    主窗 localStorage），由岛端 listener 持久化到岛页 localStorage（见 WidgetIsland 接入点）。
 */
import type { Context } from "@vitoriga20/core";
import type { SlotService } from "@vitoriga20/plugin-ide-view";

class IslandSettingsPlugin {
  name = "plugin-island-settings";
  provide: string[] = [];
  inject = ["slots"] as const;

  apply(ctx: Context): () => void {
    const slots = ctx.get("slots") as any as SlotService;
    const disposers: Array<() => void> = [];

    disposers.push(slots.register("shell.primary", {
      id: "island-settings/panel",
      label: "岛设置",
      order: 22,
      payload: {
        kind: "island-settings-panel",
        icon: "settings",
        title: "岛设置",
        desc: "灵动岛（桌面胶囊条）行为与外观：音乐控制、静默模式、全屏隐藏、开机自启等。仅桌面壳环境可用。",
        route: "island",
      },
    }));

    disposers.push(slots.register("shell.nav", {
      id: "island-settings/nav",
      label: "岛设置",
      order: 22,
      payload: {
        kind: "nav-card",
        icon: "settings",
        desc: "桌面灵动岛：媒体控制 / 静默 / 全屏隐藏 / 自启 / 透明度 / 主题",
        hash: "#island",
        orderHint: 22,
      },
    }));

    return () => { for (const off of disposers.reverse()) try { off(); } catch { /* noop */ } };
  }
}

export const PLUGIN = new IslandSettingsPlugin();
