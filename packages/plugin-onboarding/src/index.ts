/**
 * plugin-onboarding: Node 端
 *  - inject slots → 注册一张通用「快速说明」卡；具体功能入口（连接 GitHub / 设置 / 仓库动态）
 *    由各自插件自注册（github-auth / settings / repo-feed），随插件装卸而出现/消失，对齐 dsh。
 *  - 不提供任何 service、无 HTTP 路由。
 */
import type { Context } from "@vitoriga20/core";
import type { SlotName, SlotService } from "@vitoriga20/plugin-ide-view";

type NavCardState = "idle" | "active" | "completed";
interface NavCardPayload {
  kind: "nav-card";
  icon: "github" | "settings" | "feed" | "help";
  desc: string;
  hash: string;
  state: NavCardState;
  orderHint: number;
}

class OnboardingPlugin {
  name = "plugin-onboarding";
  provide: string[] = [];
  inject = ["slots"] as const;

  apply(ctx: Context): () => void {
    const slots = ctx.get("slots") as any as SlotService;
    const disposers: Array<() => void> = [];

    disposers.push(slots.register("shell.nav", {
      id: "onboarding/help",
      label: "快速说明",
      order: 40,
      payload: {
        kind: "nav-card",
        icon: "help",
        desc: "这一屏是『壳』；每个功能都是插件自注册入口，可以按需装卸",
        hash: "#settings",
        state: "idle",
        orderHint: 40,
      } as any,
    }));
    return () => { for (const off of disposers.reverse()) try { off(); } catch { /* noop */ } };
  }
}

export const PLUGIN = new OnboardingPlugin();
