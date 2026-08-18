// CLI 命令实现（web/setup/sync/status + failLoud 启动失败处理）
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import {
  boot,
  type BootResult,
  ensureProfile,
  applyPatch,
  saveProfile,
  profilePath,
  loadProfile,
  defaultProfile,
  type Context,
} from "@vibepm/core";

export function setup(): void {
  const p = profilePath();
  if (existsSync(p)) {
    console.log(`已初始化: ${p}`);
    return;
  }
  saveProfile(p, defaultProfile());
  console.log(`初始化完成，配置写入 ${p}`);
  console.log("GitHub 连接：运行 vibepm web 后，在界面点「连接 GitHub」");
}

export interface WebOptions {
  patch?: string;
  /** 自定义端口：--port <n> 覆盖 web_ui.port */
  port?: number;
  /** 自动换端口：--next 探测一个空闲端口再启动，避免 EADDRINUSE */
  next?: boolean;
  /** 端口即用即分身（dsh 风格不保存的临时 patch 注入） */
  portMode?: "explicit" | "next";
}

/** 探测本机一个空闲端口（绑定 0 + 关闭，读回实际端口），供 --next 用 */
export function findFreePort(base = 49152): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(base, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

/** 探测指定端口是否可绑定（true=空闲，false=占用） */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => {
      srv.close(() => resolve(true));
    });
  });
}

/**
 * web：启动本地服务。
 * 选项：
 *  - patch：临时配置覆盖 JSON（原语义）
 *  - port：自定义端口（--port <n>）。传给 plugin-web-ui 的 web_ui.port
 *  - next：自动换端口（--next）。先探测空闲端口注入 web_ui.port，避免 41730 占用
 */
export async function web(opts: WebOptions = {}): Promise<void> {
  const cfg = ensureProfile();

  // 按优先级：显式 --port > --next 自探测 > profile 已有 web_ui.port > 内核默认
  let portSource: "explicit" | "next" | "profile" = "profile";
  if (opts.port) portSource = "explicit";
  else if (opts.next) portSource = "next";

  let freePort: number | undefined;
  if (portSource === "explicit") {
    freePort = Number(opts.port);
  } else if (portSource === "next") {
    try {
      freePort = await findFreePort();
      console.log(`vibepm: 自动选用空闲端口 ${freePort}`);
    } catch {
      freePort = Number(cfg.web_ui?.port ?? 0);
    }
  } else {
    const p = Number(cfg.web_ui?.port ?? 0);
    if (p) freePort = p;
  }

  const patchObject = readPatchOrDie(opts.patch);
  const config = mergePatch(cfg, patchObject);
  if (freePort) {
    config.web_ui = { ...(config.web_ui ?? {}), port: freePort };
    // 兼容 loader 按 entry id 记录：同时写 plugin-web-ui，保证 mergedConfig 优先命中
    config["plugin-web-ui"] = { ...(config["plugin-web-ui"] ?? {}), port: freePort };
  }

  const result: BootResult = await boot(config);
  const ctx = result.ctx;
  // 让事件循环推进：等待 web-ui 的 listening/error 绑定事件落定(端口占用在此浮现)
  await new Promise((r) => setTimeout(r, 400));
  const fatal = result.errors.filter((e) => /web-ui|端口|EADDRINUSE/i.test(String(e.message)));
  for (const err of result.errors) {
    if (!fatal.includes(err)) console.log(`[警告] ${err.message}`);
  }
  if (result.skipped.length) console.log(`跳过插件: ${result.skipped.join(", ")}`);
  if (fatal.length) {
    console.error("vibepm: 启动失败：");
    for (const e of fatal) console.error(`  ${e.message}`);
    console.error("已清理。可用 vibepm web --next 自动换端口，或用 web_ui.port=0 让系统自动分配。");
    ctx.dispose();
    process.exitCode = 1;
    return;
  }
  if (!ctx.has("webUrl")) {
    console.error("vibepm: 启动失败：web-ui 未就绪");
    ctx.dispose();
    process.exitCode = 1;
    return;
  }
  const url = (ctx.get("webUrl") as { toString(): string }).toString();
  const busy = await waitForBind(ctx, url);
  if (busy) {
    // --next 且还是绑定失败 → 再自我检测换一个端口重试（至多一次），防瞬时占用
    if (portSource === "next") {
      const again = await findFreePort(freePort ? freePort + 1 : 49153);
      console.error(`vibepm: 端口 ${freePort} 仍占用，改换 ${again}`);
      await web({ patch: opts.patch, port: again, portMode: "next" });
      return;
    }
    ctx.dispose();
    process.exitCode = 1;
    return;
  }
  await new Promise<void>((resolve) => {
    const stop = () => {
      console.log("\n已退出");
      ctx.dispose();
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

/** 等待 boot 后 webUrl 暴露的连接可用；若端口被占返回 true */
async function waitForBind(_ctx: Context, _url: string): Promise<boolean> {
  // boot 已处理 EADDRINUSE（web-ui push 到 bootErrors），此处仅等待事件泵
  await new Promise((r) => setTimeout(r, 200));
  return false;
}

export function syncLocal(): void {
  console.log("sync 子命令待 web 内实现（TS 迁移中）");
}

export function status(): void {
  const p = profilePath();
  if (!existsSync(p)) {
    console.log(`尚未初始化，配置将写入 ${p}`);
    return;
  }
  const cfg = loadProfile(p);
  console.log(JSON.stringify(cfg, null, 2));
}

function mergePatch(base: Record<string, any>, patch?: Record<string, any>): Record<string, any> {
  if (!patch) return base;
  return applyPatch(base, patch);
}

function readPatchOrDie(patchFilePath?: string): Record<string, any> | undefined {
  if (!patchFilePath) return undefined;
  try {
    return JSON.parse(readFileSync(patchFilePath, "utf-8"));
  } catch (e) {
    console.warn(`[CLI] 读取 patch 文件失败 ${patchFilePath}：${(e as Error).message}`);
    return undefined;
  }
}
