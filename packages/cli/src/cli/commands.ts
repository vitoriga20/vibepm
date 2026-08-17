// CLI 命令实现（web/setup/sync/status + failLoud 启动失败处理）
import { existsSync, readFileSync } from "node:fs";
import { boot, type BootResult, ensureProfile, applyPatch, saveProfile, profilePath, loadProfile, defaultProfile } from "@vibepm/core";

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

export async function web(patch?: string): Promise<void> {
  const cfg = ensureProfile();
  const patchObject = readPatchOrDie(patch);
  const config = mergePatch(cfg, patchObject);
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
    console.error("已清理。可用 web_ui.port=0 让系统自动分配端口。");
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
