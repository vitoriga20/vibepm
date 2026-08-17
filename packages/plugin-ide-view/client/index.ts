/**
 * ide-view client 入口：注册自己到模块系统 → define 6 个 Web Components → 隐藏 loading → 显示 IDE。
 *
 * 当前实现是单文件 bundle（client/index.ts → tsc 输出 ESNext 浏览器可读）；
 * 后续其他 client 插件也用同样模式：每个插件的 client 结尾调：
 *   window.__VIBEPM_MODULES__.register("<entry-id>", () => ({ inject: [], provide: [], apply(ctx){ ... } }))
 */
import { modules } from "./module-system.js";
import {
  VibeTopbar,
  VibeActivityBar,
  VibeSidebar,
  VibeEditor,
  VibeRightPanel,
  VibeStatusbar,
} from "./components.js";

modules.register("plugin-ide-view", () => ({
  name: "plugin-ide-view",
  inject: [],
  provide: [],
  apply(_ctx) {
    customElements.define("vibe-topbar",      VibeTopbar);
    customElements.define("vibe-activity-bar", VibeActivityBar);
    customElements.define("vibe-sidebar",      VibeSidebar);
    customElements.define("vibe-editor",       VibeEditor);
    customElements.define("vibe-right-panel",  VibeRightPanel);
    customElements.define("vibe-statusbar",    VibeStatusbar);
    const t = setTimeout(() => {
      const bi = document.getElementById("boot-indicator");
      if (bi) bi.classList.add("hidden");
      const app = document.getElementById("app");
      if (app) app.classList.remove("hidden");
    }, 280);
    return () => clearTimeout(t);
  },
}));

// 自动启动（当被 <script defer> 加载，DOMContentLoaded 后 bootstrap）
function go(): void {
  void modules.bootstrap().catch((e) => {
    console.error("[vibepm] client boot failed:", e);
    const bi = document.getElementById("boot-indicator");
    if (bi) bi.innerHTML = `<div style="color:var(--danger);font-size:12px">启动失败<br><pre style="margin-top:8px;text-align:left;font-size:11px;max-width:72vw;max-height:40vh;overflow:auto">${String(e?.stack ?? e)}</pre></div>`;
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", go, { once: true });
} else {
  go();
}
