// S0 sidecar 打包脚本（spec §3 回落案 B）：
//   vibepm-server 形态 = pnpm deploy 出自包含目录（server/node_modules 全内置插件）
//   + 捆绑 node.exe —— spawn 命令抽象在 packages/desktop 壳层，形态切换不影响壳。
// 产物：packages/desktop/sidecar/out/
//   ├─ node.exe                  （复制 process.execPath）
//   └─ server/                   （pnpm deploy --prod：dist/bin.js + node_modules/@vitoriga20/*）
// 依赖前置：workspace 已 pnpm build（packages/cli/dist/bin.js 存在）。
// 运行：node packages/desktop/sidecar/build.mjs
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, "..", "..", "..");
const outDir = join(here, "out");
const serverDir = join(outDir, "server");
const nodeExe = join(outDir, "node.exe");

function step(msg) {
  console.log(`[sidecar] ${msg}`);
}

function fail(msg) {
  console.error(`[sidecar] 失败: ${msg}`);
  process.exit(1);
}

// 0) 前置检查
const cliBin = join(workspaceRoot, "packages", "cli", "dist", "bin.js");
if (!existsSync(cliBin)) fail(`缺少构建产物 ${cliBin}，请先在 workspace 根执行 pnpm build`);

// 1) 清理旧产物
if (existsSync(outDir)) {
  step(`清理旧产物 ${outDir}`);
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(serverDir, { recursive: true });

// 2) pnpm deploy：把 cli 包按 files 打包 + prod dependencies 装进独立目录。
//    target 用相对路径（workspace root 下），避免 Windows 命令行转义问题。
step("pnpm deploy --prod → out/server（首次会从 store 装依赖，稍等）");
const r = spawnSync(
  process.platform === "win32" ? "cmd.exe" : "pnpm",
  process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm", "--filter", "@vitoriga20/vibepm", "deploy", "--prod", "./packages/desktop/sidecar/out/server"]
    : ["--filter", "@vitoriga20/vibepm", "deploy", "--prod", "./packages/desktop/sidecar/out/server"],
  { cwd: workspaceRoot, stdio: "inherit" },
);
if (r.status !== 0) fail(`pnpm deploy 退出码 ${r.status}`);

// 3) 捆绑 node.exe（当前运行时）
step(`复制 node.exe ← ${process.execPath}`);
copyFileSync(process.execPath, nodeExe);

// 4) 产物清点（node_modules 内置插件数量对账）
const nm = join(serverDir, "node_modules", "@vitoriga20");
const pkgs = existsSync(nm) ? readdirSync(nm) : [];
const missing = ["core", "plugin-storage", "plugin-web-ui", "plugin-todo-timer", "plugin-calendar"].filter(
  (n) => !pkgs.includes(n),
);
if (missing.length) fail(`deploy 产物缺包: ${missing.join(", ")}`);
const sizeOf = (p) => {
  let t = 0;
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const fp = join(d, f.name);
      t += f.isDirectory() ? (walk(fp), 0) : statSync(fp).size;
    }
  };
  walk(p);
  return t;
};
const totalMb = (sizeOf(outDir) / 1024 / 1024).toFixed(1);
console.log(`[sidecar] 完成: out/（${totalMb} MB）`);
console.log(`[sidecar]   node.exe + server/dist/bin.js + node_modules/@vitoriga20/{${pkgs.join(", ")}}`);
console.log(`[sidecar] 冒烟: node _artifacts_/verify-sidecar-smoke.mjs`);
