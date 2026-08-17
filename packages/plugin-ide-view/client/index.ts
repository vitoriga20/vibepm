/**
 * ide-view client 入口（dsh 风格极简壳）。
 *
 * 启动顺序：
 *  1) 自定义元素 <vibe-shell> → 首屏即渲染（容器 / 头部导航 / footer / 插槽占位，对齐 dsh 「壳先出、内容懒装」）。
 *  2) 动态 import() 其他在 bootGraph 里声明的 client 入口（onboarding / settings / github-auth / repo-feed…）。
 *     每个文件都是 ES module，内部会调 `modules.register(id, factory)` → `bootstrap()` 后 apply。
 *  3) 模块 apply 完后：fire `vibepm:ready`，让 <vibe-shell> 重渲染 slots（现在注册的卡片、面板都有了）。
 */
import { modules } from "./module-system.js";
import { VibeShell } from "./components.js";

modules.register("plugin-ide-view", () => ({
  name: "plugin-ide-view",
  inject: [],
  provide: [],
  apply(_ctx) {
    customElements.define("vibe-shell", VibeShell);
  },
}));

async function go(): Promise<void> {
  const boot = (window as any).__VIBEPM_BOOT__ ?? { rev: "0", entries: [] as Array<{ id: string; url: string }> };
  // Step 1: 先 apply 已 register 的（ide-view = VibeShell）→ 首屏出
  try {
    await modules.bootstrap();
  } catch (e) {
    console.error("[vibepm] shell bootstrap failed:", e);
    renderBootError(e as Error);
    return;
  }
  // Step 2: 动态 import boot entries 里除自己以外的 client module（走 /plugins/<id>/client.js）
  const selfId = "plugin-ide-view";
  const entries: Array<{ id: string; url: string }> = Array.isArray(boot.entries) ? boot.entries : [];
  const errors: Array<{ id: string; err: Error }> = [];
  await Promise.all(
    entries
      .filter((e) => e.id !== selfId)
      .map(async (e) => {
        try {
          await import(/* @vite-ignore */ e.url);
        } catch (err) {
          errors.push({ id: e.id, err: err as Error });
          console.error(`[vibepm] client module failed: ${e.id} (${e.url})`, err);
        }
      }),
  );
  // Step 3: 再跑一次 bootstrap（只 apply 新增 register 的；我们写 bootstrap() 是幂等，重复调会跳过已 applied）
  try {
    await modules.bootstrap();
  } catch (e) {
    errors.push({ id: "<bootstrap 2>", err: e as Error });
  }
  // Step 4: 通知 shell 重渲染（slots 变了）
  try {
    const shell = document.querySelector("vibe-shell");
    if (shell && "connectedCallback" in shell.constructor.prototype) {
      // 触发 hashchange（VibeShell 监听的）即可重跑 render；用空替换不会改路由
      window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL: location.href, newURL: location.href }));
    }
  } catch { /* noop */ }
  if (errors.length) {
    console.warn("[vibepm] some modules errored:", errors);
  }
}

function renderBootError(e: Error): void {
  const banner = document.getElementById("boot-error");
  if (banner) {
    banner.classList.remove("hidden");
    banner.innerHTML = `<b>启动失败</b><div>${String(e?.message ?? e)}</div><pre>${String(e?.stack ?? e)}</pre>`;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void go(), { once: true });
} else {
  void go();
}
