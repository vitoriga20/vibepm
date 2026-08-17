// Fiber：插件在 Context 内的生命期载体 + 反应式依赖刷新（照 Python fiber.py + dsh fiber.ts）
import type { Context } from "./context.js";

export const PENDING = "PENDING";
export const LOADING = "LOADING";
export const ACTIVE = "ACTIVE";
export const UNLOADING = "UNLOADING";
export const FAILED = "FAILED";
export const DISPOSED = "DISPOSED";

export type FiberState = typeof PENDING | typeof LOADING | typeof ACTIVE | typeof UNLOADING | typeof FAILED | typeof DISPOSED;

export class FiberError extends Error {}

function isClass(fn: unknown): boolean {
  return typeof fn === "function" && /^\s*class\s/.test(Function.prototype.toString.call(fn));
}
function isThenable(v: unknown): v is Promise<unknown> {
  return typeof v === "object" && v !== null && typeof (v as any).then === "function";
}

// 对象 → 稳定整数 id（等价 Python id()），跨品牌保证 epoch/provider 稳定
const idCache = new WeakMap<object, number>();
let idCounter = 0;
function objId(v: object): number {
  let n = idCache.get(v);
  if (n === undefined) {
    n = ++idCounter;
    idCache.set(v, n);
  }
  return n;
}

export class Fiber {
  state: FiberState = PENDING;
  private _disposer: (() => void) | undefined;

  constructor(
    readonly ctx: Context,
    readonly plugin: unknown,
    readonly name: string,
    readonly provides: string[],
    readonly injects: string[],
    private _onUpdateServices: (name: string) => void,
  ) {}

  get active(): boolean {
    return this.state === ACTIVE;
  }

  private reenterable(): boolean {
    return this.state === LOADING || this.state === UNLOADING || this.state === DISPOSED;
  }

  private epochKey(): string | null {
    const parts: string[] = [];
    for (const dep of this.injects) {
      if (!this.ctx.has(dep)) return null;
      parts.push(dep, String(objId(this.ctx.get(dep) as object)));
    }
    for (const scv of this.provides) {
      if (this.ctx.has(scv)) parts.push(String(objId(this.ctx.get(scv) as object)));
    }
    return parts.join("|");
  }

  refresh(): void {
    if (this.reenterable()) return;
    const ready = this.epochKey() !== null;
    if (this.state === ACTIVE) {
      if (!ready) this.unload();
      return;
    }
    if (ready) this.load();
  }

  load(): void {
    if (this.state === ACTIVE) return;
    this.state = LOADING;
    let hook: ((ctx: Context) => unknown) | null = null;
    const plugin = this.plugin as any;
    if (typeof plugin === "function" && !isClass(plugin)) {
      hook = plugin as (ctx: Context) => unknown;
    } else if (plugin && typeof plugin.apply === "function") {
      hook = (ctx: Context) => plugin.apply(ctx);
    } else if (typeof plugin === "function" && isClass(plugin)) {
      const inst = new plugin(this.ctx, {});
      hook = typeof inst.apply === "function" ? (ctx: Context) => inst.apply(ctx) : null;
    }
    if (hook === null) {
      this.state = ACTIVE;
      return;
    }
    try {
      const result = hook(this.ctx);
      if (isThenable(result)) {
        if (this.state === LOADING) this.state = ACTIVE;
        return;
      }
      if (typeof result === "function") this._disposer = result as () => void;
      this.state = ACTIVE;
    } catch (err) {
      this.state = FAILED;
      throw new FiberError(`plugin apply failed: ${this.name}: ${String(err)}`);
    }
  }

  unload(): void {
    if (this.state !== ACTIVE) return;
    this.state = UNLOADING;
    if (this._disposer) {
      try { this._disposer(); } catch { /* noop */ }
      this._disposer = undefined;
    }
    this.state = PENDING;
  }

  dispose(): void {
    if (this.state === DISPOSED) return;
    this.unload();
    for (const name of this.provides) this.ctx.unprovide(name);
    this.state = DISPOSED;
    this._onUpdateServices(this.name);
  }
}