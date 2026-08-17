// 事件总线（照 Cordis events + 现 Python events.py）
export type Handler = (...args: any[]) => any;

export const MODE = Object.freeze({ EMIT: "emit", WATERFALL: "waterfall", PARALLEL: "parallel", SERIAL: "serial", BAIL: "bail" } as const);

function isThenable(v: unknown): boolean {
  return typeof v === "object" && v !== null && typeof (v as any).then === "function";
}

export interface LifecycleLike {
  register(disposer: () => void): void;
}

export class EventBus {
  private _subs = new Map<string, Handler[]>();

  private clean(event: string, handler: Handler): () => void {
    return () => {
      const subs = this._subs.get(event);
      if (subs) {
        const i = subs.indexOf(handler);
        if (i >= 0) subs.splice(i, 1);
        if (subs.length === 0) this._subs.delete(event);
      }
    };
  }

  on(event: string, handler: Handler, lifecycle?: LifecycleLike): () => void {
    const list = this._subs.get(event) ?? [];
    list.push(handler);
    this._subs.set(event, list);
    const off = this.clean(event, handler);
    if (lifecycle && typeof (lifecycle as any).register === "function") {
      (lifecycle as LifecycleLike).register(off);
    }
    return off;
  }

  once(event: string, handler: Handler, lifecycle?: LifecycleLike): () => void {
    let off: () => void = () => {};
    const wrapper = (...args: any[]) => {
      off();
      return handler(...args);
    };
    off = this.on(event, wrapper, lifecycle);
    return off;
  }

  emit(event: string, ...args: any[]): void {
    for (const h of [...(this._subs.get(event) ?? [])]) h(...args);
  }

  bail(event: string, ...args: any[]): unknown {
    for (const h of [...(this._subs.get(event) ?? [])]) {
      const r = h(...args);
      if (isThenable(r)) throw new TypeError("bail does not support async listeners, use serial");
      if (r !== null && r !== undefined) return r;
    }
    return undefined;
  }

  async serial(event: string, ...args: any[]): Promise<unknown> {
    for (const h of [...(this._subs.get(event) ?? [])]) {
      let r = h(...args);
      if (isThenable(r)) r = await r;
      if (r !== null && r !== undefined) return r;
    }
    return undefined;
  }

  async parallel(event: string, ...args: any[]): Promise<void> {
    const tasks: Promise<any>[] = [];
    for (const h of [...(this._subs.get(event) ?? [])]) {
      const r = h(...args);
      if (isThenable(r)) tasks.push(r);
    }
    await Promise.all(tasks);
  }

  async waterfall(event: string, ...args: any[]): Promise<unknown> {
    let prev: unknown = null;
    for (const h of [...(this._subs.get(event) ?? [])]) {
      let r = prev !== null ? h(prev, ...args) : h(...args);
      if (isThenable(r)) r = await r;
      prev = r;
    }
    return prev;
  }

  clear(): void {
    this._subs.clear();
  }

  has(event: string): boolean {
    return this._subs.has(event);
  }
}
