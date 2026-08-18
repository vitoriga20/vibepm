/**
 * plugin-ambient: client 端入口
 *  - 注册 client plugin，挂载 AmbientEngine 到 <vibe-shell> shadowRoot 的 .primary 容器。
 *  - 三层保活：
 *      1. MutationObserver 监听 document.body → 等 <vibe-shell> 出现
 *      2. MutationObserver 监听 shell.shadowRoot → shell.render() 每次销毁重建 .primary 后自动重挂
 *      3. rAF 轮询兜底 → 覆盖 observer 漏事件的边界
 *  - 不加载本插件 → 壳 .primary 保持纯色背景（降级），满足"背景可装卸为插件"。
 */
// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import { AmbientEngine } from "./sketch.js";

function getPrimary(): HTMLElement | null {
  const shell = document.querySelector("vibe-shell");
  return shell?.shadowRoot?.querySelector<HTMLElement>(".primary") ?? null;
}

// canvas 是否已挂在当前 primary 上
function isMountedOn(engine: AmbientEngine, primary: HTMLElement): boolean {
  const c = (engine as any).canvas as HTMLCanvasElement | null;
  if (!c) return false;
  return c.isConnected && c.parentElement === primary;
}

function ensureMount(engine: AmbientEngine): boolean {
  const primary = getPrimary();
  if (!primary) return false;
  if (isMountedOn(engine, primary)) return true;
  // 已挂但不在当前 primary（primary 被重建了）→ 先清旧资源
  if ((engine as any).canvas) engine.dispose();
  engine.attach(primary);
  return true;
}

modules.register("plugin-ambient", () => ({
  name: "plugin-ambient",
  inject: [],
  provide: [],
  apply() {
    const engine = new AmbientEngine();
    const obs: MutationObserver[] = [];
    let attempts = 0;

    // 观察 document.body → 等 <vibe-shell> 冒出来
    const bodyMo = new MutationObserver(() => tryHookShadow());
    bodyMo.observe(document.body, { childList: true, subtree: true });
    obs.push(bodyMo);

    const tryHookShadow = (): void => {
      const shell = document.querySelector("vibe-shell");
      if (!shell?.shadowRoot) return;
      // 已挂过 shadow observer 就不重复
      if ((shell as any).__ambientObserved) return;
      (shell as any).__ambientObserved = true;
      bodyMo.disconnect(); // 任务完成，撤 body observer
      // 监听 shadowRoot 内部：shell.render() 每次 innerHTML="" 重建 DOM，都会触发
      const shadowMo = new MutationObserver(() => {
        ensureMount(engine);
      });
      shadowMo.observe(shell.shadowRoot, { childList: true, subtree: true });
      obs.push(shadowMo);
      ensureMount(engine);
    };

    // 启动时立刻尝试 hook + mount
    tryHookShadow();

    // rAF 轮询兜底（覆盖 observer 漏掉首帧的边界）
    let raf = 0;
    const poll = (): void => {
      if (attempts < 300) {
        attempts++;
        tryHookShadow();
        ensureMount(engine);
        raf = requestAnimationFrame(poll);
      }
    };
    raf = requestAnimationFrame(poll);

    return () => {
      for (const o of obs) try { o.disconnect(); } catch {}
      cancelAnimationFrame(raf);
      const shell = document.querySelector("vibe-shell") as any;
      if (shell?.__ambientObserved) shell.__ambientObserved = false;
      engine.dispose();
    };
  },
}));