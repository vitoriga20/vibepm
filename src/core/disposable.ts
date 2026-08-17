// Disposable：一枚可逆副作用容器（照 effects.py Disposable + Cordis）
export type Disposer = () => void | Promise<void>;

interface Thenable {
  then: (onFulfilled?: (v: any) => any) => any;
}
function isThenable(v: unknown): v is Thenable {
  return typeof v === "object" && v !== null && typeof (v as any).then === "function";
}

export class Disposable {
  private _disposers: Disposer[] = [];
  private _disposed = false;
  constructor(readonly label?: string) {}

  get disposed(): boolean {
    return this._disposed;
  }

  register(disposer: Disposer): void {
    if (this._disposed) throw new Error(`effect(${this.label ?? ""}) already disposed`);
    this._disposers.push(disposer);
  }

  dispose(): void | Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    const run = this._disposers.reverse();
    this._disposers = [];
    const pending: Promise<void>[] = [];
    for (const d of run) {
      const r = d();
      if (isThenable(r)) pending.push(r);
    }
    if (pending.length) return Promise.all(pending).then(() => undefined);
    return;
  }

  async disposeAsync(): Promise<void> {
    const r = this.dispose();
    if (isThenable(r)) await r;
  }
}

/** 归一化某返回值为 disposer 列表 */
export function seekDisposers(returned: unknown): Disposer[] {
  if (returned === null || returned === undefined) return [];
  if (typeof returned === "function") return [returned as Disposer];
  const obj = returned as { dispose?: unknown };
  if (obj && typeof obj.dispose === "function") return [() => (obj.dispose as () => unknown)() as any];
  return [];
}

/** 注册 effect：立即执行 execute，返回的 disposer 收进新 Disposable */
export function effect(execute?: () => unknown, label?: string): Disposable {
  const d = new Disposable(label);
  if (execute !== undefined) {
    const returned = execute();
    for (const item of seekDisposers(returned)) d.register(item);
  }
  return d;
}

/** 收集多个 disposer 到一枚 Disposable */
export function collect(...input: Array<Disposer | Disposable | null | undefined>): Disposable {
  const d = new Disposable("collect");
  for (const x of input) {
    if (x === null || x === undefined) continue;
    const disp = x as Disposable;
    if (typeof disp.register === "function" && typeof disp.dispose === "function") {
      d.register(() => { disp.dispose(); });
      continue;
    }
    d.register(x as Disposer);
  }
  return d;
}