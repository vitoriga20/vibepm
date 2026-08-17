// Context：插件运行时，一个 Context 即一个应用（照 Cordis + Python context.py）
import { EventBus, type Handler, type LifecycleLike } from "./eventbus.js";
import { Fiber } from "./fiber.js";
import { ServiceRegistry } from "./services.js";
import { resolvePlugin, type PluginMeta } from "./registry.js";
import { Disposable } from "./disposable.js";

export interface AppLoaderLike {
  save_runtime?(ctx: unknown, section: string, data: Record<string, unknown>): void;
}

export class Context implements LifecycleLike {
  registry = new ServiceRegistry();
  events = new EventBus();
  readonly config: Record<string, any>;
  readonly parent: Context | null;
  readonly scope: string | null;
  readonly children: Context[] = [];
  readonly loader: AppLoaderLike | null;
  readonly pluginPaths: Map<string, string>;
  private _plugins = new Map<string, { plugin: unknown; config: Record<string, any> }>();
  readonly fibers = new Map<string, Fiber>();
  private _nextFiberMap = new Map<string, Disposable>();
  bootErrors: Error[] = [];

  constructor(opts?: {
    config?: Record<string, any>;
    parent?: Context | null;
    scope?: string | null;
    pluginPaths?: Map<string, string>;
    loader?: AppLoaderLike | null;
  }) {
    this.config = opts?.config ?? {};
    this.parent = opts?.parent ?? null;
    this.scope = opts?.scope ?? null;
    this.pluginPaths = opts?.pluginPaths ?? new Map();
    this.loader = opts?.loader ?? null;
  }

  // ---- 服务代理 ----
  provide(name: string, instance: unknown, scope?: string): void {
    this.registry.provide(name, instance, scope);
    this.flushDependents(name);
  }
  get(name: string, scope?: string): unknown {
    return this.registry.get(name, scope);
  }
  has(name: string, scope?: string): boolean {
    return this.registry.has(name, scope);
  }
  unprovide(name: string, scope?: string): void {
    this.registry.unprovide(name, scope);
  }
  onUpdate(name: string, cb: (name: string) => void): void {
    this.registry.onUpdate(name, cb);
  }

  private flushDependents(name: string): void {
    for (const fiber of this.fibers.values()) {
      if (fiber.injects.includes(name) || fiber.provides.includes(name)) {
        try {
          fiber.refresh();
        } catch (e) {
          this.bootErrors.push(e as Error);
        }
      }
    }
  }

  // ---- 事件 ----
  on(event: string, handler: Handler): () => void {
    return this.events.on(event, handler, this);
  }
  once(event: string, handler: Handler): () => void {
    return this.events.once(event, handler, this);
  }
  emit(event: string, ...args: any[]): void {
    this.events.emit(event, ...args);
  }
  bail(event: string, ...args: any[]): unknown {
    return this.events.bail(event, ...args);
  }
  async serial(event: string, ...args: any[]): Promise<unknown> {
    return this.events.serial(event, ...args);
  }
  async parallel(event: string, ...args: any[]): Promise<void> {
    return this.events.parallel(event, ...args);
  }
  async waterfall(event: string, ...args: any[]): Promise<unknown> {
    return this.events.waterfall(event, ...args);
  }

  // ---- effect（LifecycleLike）----
  register(disposer: () => void): void {
    this.effect().register(disposer);
  }
  effect(label?: string): Disposable {
    return this._fiberEffect;
  }
  createDisposable(label?: string): Disposable {
    return new Disposable(label);
  }
  disposeFiberEffect(_fiberName: string): void {
    // 卸载时统一回收本 fiber 副作用（简化：按需扩展）
  }

  // ---- 子上下文 ----
  extend(scope?: string): Context {
    const sub = new Context({
      config: this.config,
      parent: this,
      scope,
      pluginPaths: this.pluginPaths,
      loader: this.loader,
    });
    this.children.push(sub);
    return sub;
  }
  isolate(name: string): Context {
    return this.extend(name);
  }

  // ---- 插件挂载 ----
  plugin(plugin: unknown, config?: Record<string, any>, name?: string): Fiber {
    const meta: PluginMeta = resolvePlugin(plugin, name);
    const fname = meta.name;
    this._plugins.set(fname, { plugin: meta.plugin, config: config ?? {} });

    const fiber = new Fiber(this, meta.plugin, fname, meta.provide, meta.inject, (nm) => this.flushDependents(nm));
    this.fibers.set(fname, fiber);
    try {
      fiber.refresh();
    } catch (e) {
      this.bootErrors.push(e as Error);
    }
    return fiber;
  }

  mergedConfig(name: string): Record<string, any> {
    const base = { ...(this.config[name] ?? {}) };
    const mount = this._plugins.get(name)?.config ?? {};
    const merged: Record<string, any> = { ...base };
    for (const [k, v] of Object.entries(mount)) {
      if (typeof v === "object" && v !== null && !Array.isArray(v) && typeof merged[k] === "object" && merged[k] !== null) {
        merged[k] = { ...merged[k], ...v };
      } else {
        merged[k] = v;
      }
    }
    return merged;
  }
  scopedConfig(name: string): Record<string, any> {
    return this.mergedConfig(name);
  }

  // ---- 审计 / 清理 ----
  settle(): Error[] {
    for (const fiber of this.fibers.values()) {
      if (fiber.state === "PENDING") {
        try {
          fiber.refresh();
        } catch (e) {
          this.bootErrors.push(e as Error);
        }
      }
    }
    return this.bootErrors;
  }

  dispose(): void {
    for (const sub of [...this.children].reverse()) sub.dispose();
    for (const fiber of [...this.fibers.values()].reverse()) fiber.dispose();
    this._fiberEffect.dispose();
    this.events.clear();
    this.registry.clear();
  }

  // 插件注册的 effect 收集容器（应用级副作用，逆序清理）
  private _fiberEffect = new Disposable("context");

  contains(name: string): boolean {
    return this.registry.has(name);
  }
}