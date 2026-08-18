// Client Module System 的 Node 侧服务：
// - 持有 ResolvedEntry 表（来自 manifest.scanWorkspace）
// - 提供 /plugins/<id>/** 下任意 client bundle 子文件（给 web_ui 路由静态服务）
// - 提供 bootGraph（= manifest.buildBootGraph 快照，注入 index.html <script>）
// 浏览器侧 window.__VIBEPM_MODULES__ 的表结构由 packages/plugin-ide-view/client/module-system.ts 实现。
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import type { Context } from "./context.js";
import { buildBootGraph, scanWorkspace, type BootGraph, type ResolvedEntry } from "./manifest.js";

function contentTypeFor(ext: string): string {
  switch (ext) {
    case ".js":
    case ".mjs":
    case ".cjs":
      return "application/javascript";
    case ".css":
      return "text/css";
    case ".map":
      return "application/json";
    case ".svg":
      return "image/svg+xml";
    case ".html":
    case ".htm":
      return "text/html";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

export class ClientModuleHost {
  static readonly NAME = "bootGraph";
  private _entries: Map<string, ResolvedEntry>;
  private _rev = "";
  private _graph: BootGraph;

  constructor(workspaceRoot?: string) {
    this._entries = scanWorkspace(workspaceRoot);
    this._graph = buildBootGraph(this._entries);
    this._rev = this._graph.rev;
  }

  get rev(): string { return this._rev; }

  entries(): IterableIterator<ResolvedEntry> {
    return this._entries.values();
  }

  getEntry(id: string): ResolvedEntry | undefined {
    return this._entries.get(id);
  }

  /** 并入额外解析出的 entry（如已安装到 pluginsDir 的三方插件），并重算 bootGraph */
  mergeEntries(extra: Map<string, ResolvedEntry>): void {
    if (!extra.size) return;
    for (const [k, v] of extra) this._entries.set(k, v);
    this._graph = buildBootGraph(this._entries);
    this._rev = this._graph.rev;
  }

  /**
   * 冷启动禁用的插件：从 entries/bootGraph 整体剔除（对齐 dsh 组合层禁用=plugin 消失）。
   * 前端壳依 window.__VIBEPM_BOOT__.entries 动态 import client 半，剔除后不再加载 → 彻底不生效。
   */
  excludeMany(ids: Iterable<string>): void {
    let changed = false;
    for (const id of ids) {
      if (this._entries.delete(id)) changed = true;
    }
    if (changed) {
      this._graph = buildBootGraph(this._entries);
      this._rev = this._graph.rev;
    }
  }

  graph(): BootGraph {
    return this._graph;
  }

  /** 路由 /plugins/<id>/client.js → 磁盘文件字节 + content-type */
  serveClientJs(id: string): { bytes: Buffer; contentType: string } | null {
    return this.serve(id, "client.js");
  }

  serveClientCss(id: string): { bytes: Buffer; contentType: string } | null {
    const e = this._entries.get(id);
    if (!e || !e.clientStyles || !existsSync(e.clientStyles)) return null;
    const dot = e.clientStyles.lastIndexOf(".");
    const ext = dot >= 0 ? e.clientStyles.slice(dot) : ".css";
    return { bytes: readFileSync(e.clientStyles), contentType: contentTypeFor(ext) };
  }

  /**
   * 路由 /plugins/<id>/<relPathHref> → 读取 client 目录下的文件。
   * 约定：relPathHref === "client.js" 默认映射到 entry 的 dist/client/index.js；
   *       其他路径（如 ./module-system.js）按相对于 clientEntry 目录解析。
   * 提供目录穿越保护。
   */
  serve(id: string, relPathHref: string): { bytes: Buffer; contentType: string } | null {
    const e = this._entries.get(id);
    if (!e || !e.clientEntry) return null;
    const clientBase = dirname(e.clientEntry); // dist/client
    let relPath = relPathHref.replaceAll("/", sep);
    // "client.js" 作为入口别名 → clientEntry 本身
    let abs: string;
    if (relPath === "client.js") {
      abs = e.clientEntry;
    } else {
      abs = resolve(clientBase, relPath);
    }
    if (!abs.startsWith(normalize(clientBase) + sep)) return null;
    if (!existsSync(abs)) return null;
    const dot = abs.lastIndexOf(".");
    const ext = dot >= 0 ? abs.slice(dot) : "";
    return { bytes: readFileSync(abs), contentType: contentTypeFor(ext) };
  }

  /** 强制重扫（dev 下文件变更调用） */
  rescan(workspaceRoot?: string): void {
    this._entries = scanWorkspace(workspaceRoot);
    this._graph = buildBootGraph(this._entries);
    this._rev = this._graph.rev;
  }
}

export function clientModulesPlugin(workspaceRoot?: string): { name: string; provide: string[]; inject: string[]; apply(ctx: Context): () => void } {
  return {
    name: ClientModuleHost.NAME,
    provide: [ClientModuleHost.NAME],
    inject: [],
    apply(ctx: Context): () => void {
      ctx.provide(ClientModuleHost.NAME, new ClientModuleHost(workspaceRoot));
      return () => undefined;
    },
  };
}
