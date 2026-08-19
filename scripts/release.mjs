#!/usr/bin/env node
// vibepm 发布流水线（对齐 dsh scripts/release 思路，适度简化）：
//   node scripts/release.mjs pack     → 构建 + pnpm pack 全部包到 dist-tarballs/
//   node scripts/release.mjs verify   → 把 tarball 装进临时目录，跑 bin --version + web 冒烟
//   node scripts/release.mjs publish  → 按依赖序发布 tarball（需已 npm login）
// 前提：Node >= 22.5（node:sqlite），pnpm 可用。

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist-tarballs");
// pack 时写入 name → tarball 文件名的清单，verify/publish 读取（不依赖文件名猜测）
const MANIFEST = join(OUT, "tarballs.json");

// 发布顺序：被依赖的先发（core → 依赖它的插件 → cli 最后，cli 依赖全部）
const PUBLISH_ORDER = [
  "@vitoriga20/core",
  "@vitoriga20/plugin-web-ui",
  "@vitoriga20/plugin-ide-view",
  "@vitoriga20/plugin-storage",
  "@vitoriga20/plugin-onboarding",
  "@vitoriga20/plugin-skin-rhine",
  "@vitoriga20/plugin-github",
  "@vitoriga20/plugin-settings",
  "@vitoriga20/plugin-plugin-manager",
  "@vitoriga20/plugin-ambient",
  "@vitoriga20/vibepm",
];

const PKG_DIRS = new Map([
  ["@vitoriga20/core", "packages/core"],
  ["@vitoriga20/vibepm", "packages/cli"],
  ["@vitoriga20/plugin-storage", "packages/plugin-storage"],
  ["@vitoriga20/plugin-web-ui", "packages/plugin-web-ui"],
  ["@vitoriga20/plugin-ide-view", "packages/plugin-ide-view"],
  ["@vitoriga20/plugin-onboarding", "packages/plugin-onboarding"],
  ["@vitoriga20/plugin-github", "packages/plugin-github"],
  ["@vitoriga20/plugin-settings", "packages/plugin-settings"],
  ["@vitoriga20/plugin-plugin-manager", "packages/plugin-plugin-manager"],
  ["@vitoriga20/plugin-ambient", "packages/plugin-ambient"],
  ["@vitoriga20/plugin-skin-rhine", "packages/plugin-skin-rhine"],
]);

function run(cmd, args, opts = {}) {
  // Windows 下 pnpm/npm 是 .cmd 脚本，spawnSync 需 shell 才能找到（对齐 cli plugin.ts 做法）
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, shell: process.platform === "win32", ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed with exit ${r.status}`);
}

function runCapture(cmd, args, opts = {}) {
  // 只用于 node.exe 直接调用（数组参数，无需 shell，避免路径空格被拼接）
  const r = spawnSync(cmd, args, { encoding: "utf-8", ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

function cmdPack() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  run("pnpm", ["run", "build"], { cwd: ROOT });
  // 逐包 pack（pnpm pack 会像 publish 一样把 workspace:* 改写为版本号）
  const packed = {};
  for (const [name, rel] of PKG_DIRS) {
    const dir = join(ROOT, rel);
    run("pnpm", ["pack", "--pack-destination", OUT], { cwd: dir });
    // 最新生成的 tarball（按 mtime）即本包产物
    const files = readdirSync(OUT).filter((f) => f.endsWith(".tgz"));
    const latest = files.sort((a, b) => statSync(join(OUT, b)).mtimeMs - statSync(join(OUT, a)).mtimeMs)[0];
    packed[name] = latest;
    console.log(`packed: ${name} → ${latest}`);
  }
  writeFileSync(MANIFEST, JSON.stringify(packed, null, 2));
  console.log(`\n${Object.keys(packed).length} tarballs in ${OUT}`);
}

function readManifest() {
  if (!existsSync(MANIFEST)) {
    console.error("dist-tarballs/tarballs.json 不存在，先跑 pack");
    process.exit(1);
  }
  return JSON.parse(readFileSync(MANIFEST, "utf-8"));
}

async function cmdVerify() {
  const packed = readManifest();
  const tgz = Object.values(packed).filter((f) => f.endsWith(".tgz"));
  const consumer = join(tmpdir(), `vibepm-install-${Date.now()}`);
  mkdirSync(consumer, { recursive: true });
  try {
    const deps = Object.fromEntries(
      Object.entries(packed).map(([name, file]) => [name, `file:${join(OUT, file).replace(/\\/g, "/")}`]),
    );
    writeFileSync(
      join(consumer, "package.json"),
      JSON.stringify({ name: "vibepm-consumer", version: "0.0.0", private: true, dependencies: deps }, null, 2),
    );
    console.log(`installing ${tgz.length} tarball(s) into ${consumer}`);
    run("npm", ["install", "--no-audit", "--no-fund", "--package-lock=false"], { cwd: consumer });

    const bin = join(consumer, "node_modules", "@vitoriga20", "vibepm", "dist", "bin.js");
    if (!existsSync(bin)) throw new Error(`installed bin missing: ${bin}`);

    const version = runCapture(process.execPath, [bin, "--version"], { cwd: consumer }).trim();
    console.log(`installed vibepm --version → ${version}`);

    // web 冒烟：起服务 → 等 health → kill
    const child = spawn(process.execPath, [bin, "web", "--port", "0"], { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] });
    const url = await new Promise((resolveUrl, rejectUrl) => {
      let out = "";
      const timer = setTimeout(() => {
        child.kill();
        rejectUrl(new Error(`web 冒烟超时，输出: ${out}`));
      }, 20000);
      child.stdout.on("data", (d) => {
        out += d.toString();
        const m = out.match(/vibepm web: (http:\/\/[^\s]+)/);
        if (m) { clearTimeout(timer); resolveUrl(m[1]); }
      });
      child.stderr.on("data", (d) => { out += d.toString(); });
      child.on("exit", (code) => {
        clearTimeout(timer);
        rejectUrl(new Error(`web 提前退出 code=${code}，输出: ${out}`));
      });
    });
    try {
      const health = await fetch(`${url}/api/health`).then((r) => r.json());
      if (!health?.ok) throw new Error(`health 异常: ${JSON.stringify(health)}`);
      const boot = await fetch(`${url}/api/boot`).then((r) => r.json());
      const entries = boot?.entries?.length ?? 0;
      console.log(`web 冒烟通过: ${url}/api/health → ${JSON.stringify(health)}，boot entries=${entries}`);
    } finally {
      try { child.kill(); } catch { /* noop */ }
      // 等子进程退出释放文件句柄，再删临时目录（Windows 上立即删会 EPERM）
      await new Promise((r) => setTimeout(r, 800));
    }
  } finally {
    try {
      rmSync(consumer, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch {
      console.warn(`cleanup 临时目录失败（已忽略）: ${consumer}`);
    }
  }
}

function cmdPublish() {
  const packed = readManifest();
  const otp = process.env.VIBEPM_OTP ?? "";
  const byName = new Map(Object.entries(packed).map(([name, file]) => [name, join(OUT, file)]));
  for (const name of PUBLISH_ORDER) {
    const file = byName.get(name);
    if (!file || !existsSync(file)) throw new Error(`缺少 ${name} 的 tarball`);
    console.log(`publishing ${name} ...`);
    // 2FA 账号需 OTP；脚本不硬编码，用 VIBEPM_OTP 环境变量传入一次性码（非明文入参避免入 shell 历史）
    run("npm", ["publish", file, "--access", "public", ...(otp ? ["--otp", otp] : [])]);
  }
  console.log("全部发布完成");
}

const mode = process.argv[2];
switch (mode) {
  case "pack":
    cmdPack();
    break;
  case "verify":
    await cmdVerify();
    break;
  case "publish":
    cmdPublish();
    break;
  default:
    console.error("usage: node scripts/release.mjs <pack|verify|publish>");
    process.exit(1);
}
