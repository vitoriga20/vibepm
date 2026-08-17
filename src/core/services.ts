// 服务模型 + 反应式注册表（照 Cordis services + 现 Python services.py）

export class ServiceNotFoundError extends Error {
  constructor(name: string, scope?: string) {
    super(scope ? `service not provided: ${name}@${scope}` : `service not provided: ${name}`);
  }
}

export class Service {
  name = "";
  /** 服务级依赖（同 inject 语义，required） */
  inject: string[] = [];
  required = true;

  check(ctx: unknown): boolean {
    return true;
  }
}

interface ProviderEntry {
  instance: unknown;
  scope: string | null;
  fiber?: unknown;
}

export class ServiceRegistry {
  private _store = new Map<string, ProviderEntry[]>();
  private _listeners: Array<{ match: string | null; cb: (name: string) => void }> = [];

  get(name: string, scope?: string): unknown {
    const entries = this._store.get(name);
    if (!entries || entries.length === 0) throw new ServiceNotFoundError(name);
    if (scope !== undefined) {
      const hit = entries.find((e) => (e.scope ?? "") === scope);
      if (hit) return hit.instance;
      throw new ServiceNotFoundError(name, scope);
    }
    // 默认取最近提供：优先非 scope 条目
    const scoped = entries.find((e) => e.scope === null || e.scope === "");
    if (scoped) return scoped.instance;
    return entries[entries.length - 1].instance;
  }

  has(name: string, scope?: string): boolean {
    try {
      this.get(name, scope);
      return true;
    } catch {
      return false;
    }
  }

  names(): string[] {
    return [...this._store.keys()];
  }

  provide(name: string, instance: unknown, scope?: string): void {
    const list = this._store.get(name) ?? [];
    list.push({ instance, scope: scope ?? null });
    this._store.set(name, list);
    this._notify(name);
  }

  unprovide(name: string, scope?: string, instance?: unknown): void {
    const entries = this._store.get(name);
    if (!entries || entries.length === 0) return;
    if (instance !== undefined) {
      this._store.set(name, entries.filter((e) => e.instance !== instance));
    } else if (scope !== undefined) {
      this._store.set(name, entries.filter((e) => (e.scope ?? "") !== scope));
    } else {
      const kept = entries.filter((e) => !(e.scope === null || e.scope === ""));
      this._store.set(name, kept.length ? kept : []);
    }
  }

  onUpdate(name: string, cb: (name: string) => void): void {
    this._listeners.push({ match: name, cb });
  }

  removeUpdate(cb: (name: string) => void): void {
    this._listeners = this._listeners.filter((kv) => kv.cb !== cb);
  }

  private _notify(name: string): void {
    for (const { match, cb } of this._listeners) {
      if (match === "*" || match === name) cb(name);
    }
  }

  clear(): void {
    this._store.clear();
    this._listeners = [];
  }
}

/** 从插件对象提取提供(furnishes)的服务名列表 */
export function pluginProvides(p: unknown): string[] {
  const got = (p as any)?.provide;
  if (got === null || got === undefined) return [];
  if (typeof got === "string") return [got];
  if (Array.isArray(got)) return [...got];
  return [String(got)];
}

/** 从插件对象提取注入依赖 */
export function pluginInjects(p: unknown): string[] {
  const inject = (p as any)?.inject;
  if (inject === null || inject === undefined) return [];
  return Array.isArray(inject) ? [...inject] : [];
}