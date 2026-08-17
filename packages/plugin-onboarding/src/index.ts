/**
 * plugin-onboarding: Node 端
 *  - inject slots → 在 shell.nav 注册 4 张引导卡片（连接 GitHub / 调整设置 / 看项目动态 / 阅读说明）。
 *  - inject db → 判断 github.token 是否已存 → 把 「连接 GitHub」 卡片的 state 改成 "completed"。
 *  - 不提供任何 service、无 HTTP 路由（HTTP 留给 settings / github-auth）。
 */
import type { Context } from "@vibepm/core";
import type { SlotName, SlotService } from "@vibepm/plugin-ide-view";

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
  inject = ["slots", "db"] as const;

  apply(ctx: Context): () => void {
    const slots = ctx.get("slots") as any as SlotService;
    const db = ctx.get("db") as any as { getSetting(k: string): unknown };
    const disposers: Array<() => void> = [];

    const githubDone = !!db.getSetting("github.token");
    const cards: Array<{ id: string; label: string; order: number; payload: NavCardPayload }> = [
      {
        id: "onboarding/github",
        label: "连接 GitHub",
        order: 10,
        payload: {
          kind: "nav-card",
          icon: "github",
          desc: githubDone ? "已连接 · 可以拉仓库与动态" : "填写 Personal Access Token，让 vibepm 为你抓仓库与动态",
          hash: "#auth",
          state: githubDone ? "completed" : "active",
          orderHint: 10,
        },
      },
      {
        id: "onboarding/settings",
        label: "偏好设置",
        order: 20,
        payload: {
          kind: "nav-card",
          icon: "settings",
          desc: "外观、默认工作目录、GitHub 用户名等（插件化、按需加字段）",
          hash: "#settings",
          state: "idle",
          orderHint: 20,
        },
      },
      {
        id: "onboarding/feed",
        label: "仓库动态",
        order: 30,
        payload: {
          kind: "nav-card",
          icon: "feed",
          desc: "关注仓库的 push / PR / issue / release timeline",
          hash: "#feed",
          state: githubDone ? "active" : "idle",
          orderHint: 30,
        },
      },
      {
        id: "onboarding/help",
        label: "快速说明",
        order: 40,
        payload: {
          kind: "nav-card",
          icon: "help",
          desc: "这一屏是『壳』；所有功能都走插件，可以按需装卸",
          hash: "#settings",
          state: "idle",
          orderHint: 40,
        },
      },
    ];
    for (const c of cards) {
      disposers.push(slots.register("shell.nav", {
        id: c.id, label: c.label, order: c.order, payload: c.payload as any,
      }));
    }
    return () => { for (const off of disposers.reverse()) try { off(); } catch { /* noop */ } };
  }
}

export const PLUGIN = new OnboardingPlugin();
