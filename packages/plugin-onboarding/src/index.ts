/**
 * plugin-onboarding: Node 端
 *  - 已不再注册「快速说明」导航卡（2026-08-20：其 hash 指 #settings 导致点击跳到设置页，按用户要求删除）。
 *  - 保留空壳：功能入口（连接 GitHub / 设置 / 仓库动态）由各自插件自注册，随插件装卸而出现/消失。
 */
import type { Context } from "@vitoriga20/core";

class OnboardingPlugin {
  name = "plugin-onboarding";
  provide: string[] = [];
  inject = ["slots"] as const;

  apply(_ctx: Context): () => void {
    return () => {};
  }
}

export const PLUGIN = new OnboardingPlugin();
