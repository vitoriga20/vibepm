// ide-view 插件 Node 半：dsh 风格极简壳，不写任何业务槽。
// 功能（settings / github-auth / feed / onboarding）都由各自独立插件往 slots 注册。
// 本插件仅负责一件兜底：shell.footer 写一个 vibepm 版本/版权条，保证首屏不空。
import type { Context, SlotService } from "@vibepm/core";
// re-export core 的 SlotName / SlotService（供 settings/onboarding/… Node 侧 import type）
export type { SlotName, SlotService, SlotItem } from "@vibepm/core";

class IdeViewPlugin {
  name = "plugin-ide-view";
  provide = [];
  inject = ["slots"];
  // dsh.client manifest 在 package.json

  apply(ctx: Context): () => void {
    const slots = ctx.get("slots") as SlotService;
    const disposers: Array<() => void> = [];

    // 兜底：footer 版本号，任何情况下都显示
    disposers.push(slots.register("shell.footer", {
      id: "ide-view/version",
      label: "vibepm 0.1.0",
      order: 900,
      payload: { kind: "version" },
    }));

    return () => { for (const off of disposers.reverse()) try { off(); } catch { /* noop */ } };
  }
}

export const PLUGIN = new IdeViewPlugin();
