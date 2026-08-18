/**
 * 极简版浏览器侧模块系统（对齐 dsh dsh-client-modules 思想，但不做工厂延迟 + HMR）。
 * 由壳内核（本 client，即插件行的第一个）构造 window.__VIBEPM_MODULES__；
 * 每个 client 插件在执行末尾调用：
 *     window.__VIBEPM_MODULES__.register("pkg-id", { apply(ctx) { ... } });
 * （插件不再 import 本文件 URL；模块表由内核提供，换壳不换插件。）
 *
 * 本文件直接 define 一个 window.__VIBEPM_MODULES__ 表 + 启动函数 bootstrap()
 * 它按 immediately 标记 + inject 依赖（服务级，非包级）顺序 apply 所有插件。
 */

export interface ClientPluginShape {
  name?: string;
  inject?: string[];
  provide?: string[];
  apply(ctx: ClientContext): (() => void) | void;
}

export interface ClientContext {
  /** 服务注册表（浏览器侧精简版） */
  services: ServiceRegistry;
  /** slots 快照，来自 <script> 注入的 window.__VIBEPM_SLOTS__ */
  slots: Readonly<Record<string, Array<{ id: string; label?: string; order?: number; icon?: string; payload?: any }>>>;
  /** bootGraph 来自 <script> 注入的 window.__VIBEPM_BOOT__ */
  boot: Readonly<{ rev: string; entries: any[] }>;
  /** 浏览器窗口事件 */
  events: EventTarget;
}

class ServiceRegistry {
  private _m = new Map<string, unknown>();
  provide(name: string, value: unknown): void { this._m.set(name, value); }
  has(name: string): boolean { return this._m.has(name); }
  get<T = unknown>(name: string): T {
    if (!this._m.has(name)) throw new Error(`service missing: ${name}`);
    return this._m.get(name) as T;
  }
}

type Factory = () => ClientPluginShape | Promise<ClientPluginShape>;

class ClientModuleSystem {
  private _factories = new Map<string, Factory>();
  private _applied = new Map<string, { entry: any; plugin: ClientPluginShape; dispose?: () => void }>();
  services = new ServiceRegistry();
  events = new EventTarget();

  register(id: string, factory: Factory): void {
    this._factories.set(id, factory);
  }

  async bootstrap(): Promise<void> {
    const boot: any = (window as any).__VIBEPM_BOOT__ ?? { rev: "0", entries: [] };
    const slots: any = (window as any).__VIBEPM_SLOTS__ ?? {};
    // 规范化 slots：只保留极简壳 4 槽（shell.*），空 slot 给 []
    const normSlots: any = {};
    for (const k of ["shell.nav", "shell.primary", "shell.secondary", "shell.footer"]) {
      normSlots[k] = slots[k] ?? [];
    }
    const ctx: ClientContext = { services: this.services, slots: normSlots, boot, events: this.events };

    // Phase 1: 跑所有 factory（拿到 plugin 形状；不做依赖等待/刷新，极简，当前只有 ide-view）
    const plugins: Array<{ id: string; entry: any; shape: ClientPluginShape }> = [];
    for (const entry of boot.entries) {
      const f = this._factories.get(entry.id);
      if (!f) continue; // 本文件是 ide-view 自己，它在最后内联 register，后面会手动扫一次已注册的
      const shape = await Promise.resolve(f());
      plugins.push({ id: entry.id, entry, shape });
    }
    // 兜底：注册了但 boot 没列（例如 ide-view 自己内联）
    for (const [id, f] of this._factories) {
      if (plugins.some((p) => p.id === id)) continue;
      const entry = boot.entries.find((e: any) => e.id === id) ?? { id, inject: [], provide: [], immediately: true };
      const shape = await Promise.resolve(f());
      plugins.push({ id, entry, shape });
    }
    // Phase 2: 顺序 apply（极简，不做 service 依赖等待，当前 ide-view 无 inject 服务）
        // 幂等：已经 applied 的插件直接跳过（ide-view shell 等不会重复 apply → CustomElement already defined 错）
        for (const p of plugins) {
            if (this._applied.has(p.id))
                continue;
            try {
                const disp = p.shape.apply(ctx);
                this._applied.set(p.id, { entry: p.entry, plugin: p.shape, dispose: disp ?? undefined });
            }
            catch (e) {
                console.error("[vibepm] client plugin failed:", p.id, e);
            }
        }
  }
}

export const modules = new ClientModuleSystem();
(window as any).__VIBEPM_MODULES__ = modules;
