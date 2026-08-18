/**
 * plugin-hello · Client 半（最小模板）
 *  - 经 ide-view 的 module-system 注册；apply 时向页面做两件可观测的副作用：
 *      1) documentElement 写 --third-party-hello=loaded（探针可读，证明 client 半已被 bootGraph 动态 import 与 apply）
 *      2) body 右下角插一个状态角标（肉眼可验证「第三方插件是活的」）
 *  - dispose 时全部还原。第三方替换 apply() 内的业务即可。
 */
// @ts-ignore TS 无法识别浏览器专用的 URL 模块
import { modules } from "/plugins/plugin-ide-view/module-system.js";

const SELF = "plugin-hello";

modules.register(SELF, () => ({
  name: SELF,
  inject: [],
  provide: [],
  apply(): () => void {
    document.documentElement.style.setProperty("--third-party-hello", "loaded");

    const badge = document.createElement("div");
    badge.id = "vibepm-hello-badge";
    badge.textContent = "THIRD-PARTY PLUGIN · plugin-hello · OK";
    const s: Partial<CSSStyleDeclaration> = {
      position: "fixed",
      left: "14px",
      bottom: "40px",
      zIndex: "90",
      color: "#fff44f",
      background: "#0b0d0f",
      border: "1px solid #fff44f",
      padding: "5px 8px",
      font: "10px/1 ui-monospace,SFMono-Regular,Consolas,monospace",
      letterSpacing: "1px",
      boxShadow: "3px 3px 0 #000",
      pointerEvents: "none",
    };
    Object.assign(badge.style, s);
    document.body.appendChild(badge);

    return () => {
      document.documentElement.style.removeProperty("--third-party-hello");
      badge.remove();
    };
  },
}));