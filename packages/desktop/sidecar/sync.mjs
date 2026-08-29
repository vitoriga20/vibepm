// quick sync: refresh workspace build artifacts into sidecar/out (no full deploy)
// run AFTER stopping shell+sidecar (files are locked while server runs)
// NOTE: cpSync crashes silently (exit 127) on node 24.13 with these hardlinked dirs — hand-rolled copy instead
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

const root = process.cwd();
const serverDir = join(root, "packages", "desktop", "sidecar", "out", "server");
if (!existsSync(serverDir)) {
  console.error("out/ missing - run build.mjs full deploy first");
  process.exit(1);
}
const pkgsDir = join(root, "packages");
let n = 0;
for (const name of readdirSync(pkgsDir)) {
  const src = join(pkgsDir, name);
  if (!name.startsWith("plugin-") || !existsSync(join(src, "package.json"))) continue;
  const dst = join(serverDir, "node_modules", "@vitoriga20", name);
  if (!existsSync(dst)) continue;
  for (const part of ["client-dist", "static", "dist"]) {
    if (existsSync(join(src, part))) {
      copyDir(join(src, part), join(dst, part));
      n++;
    }
  }
}
copyDir(join(pkgsDir, "cli", "dist"), join(serverDir, "dist"));
console.log(`[sidecar] sync ok: ${n} plugin artifact dirs + cli/dist refreshed`);
