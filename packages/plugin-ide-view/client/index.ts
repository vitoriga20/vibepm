/**
 * ide-view client 入口：注册自己到模块系统 → define 6 个 Web Components（首屏已显示 IDE 外壳）。
 *
 * 对齐 dsh：没有「启动中 loading 动画」。index.html 首屏 DOM 直接可视，
 * 浏览器 <script defer> 加载到本文件 → customElements.define → Web Components 同步挂载；
 * 不需要等待用户看到一个 spinner。
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
    // 无 dispose 需要
    return;
  },
}));

// 自动启动（当被 <script defer> 加载，DOMContentLoaded 后 bootstrap）
function go(): void {
  void modules.bootstrap().catch((e) => {
    console.error("[vibepm] client boot failed:", e);
    const banner = document.getElementById("boot-error");
    if (banner) {
      banner.classList.remove("hidden");
      banner.innerHTML = `<b>启动失败</b><div>${String(e?.message ?? e)}</div><pre>${String(e?.stack ?? e)}</pre>`;
    }
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", go, { once: true });
} else {
  go();
}
