#!/usr/bin/env node
/**
 * verify-no-hardcolor —— 硬编码色值门禁
 *
 * 职责：扫描「token 源」里登记的色值（hex / rgb / rgba），
 *       再扫描所有 UI 运行时文件；若某个已登记色值在 **非 token 源** 里
 *       以字面量（非 var()/非定义处）出现，判定为硬编码违规，退出码 1。
 *
 * token 源（白名单，色值在此登记，允许字面量）：
 *   - packages/plugin-web-ui/static/shell.css 的 :root { --x: <color> }
 *   - 各 skin 插件 client 里集中定义皮肤 token 的常量（如 RHINE_TOKEN）
 *
 * 判据（对齐 rules.md「硬编码边界定义」）：
 *   - 色值承载语义 → 必须 token；若 token 已存在而组件里重写 → 违规。
 *   - 组件/CSS 使用颜色一律 var(--x) 或 color-mix(...var(--x)...)。
 *
 * 用法：node scripts/verify-no-hardcolor.mjs [--exclude <glob>]
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, basename, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TOKEN_FILES = [
  join(ROOT, "packages", "plugin-web-ui", "static", "shell.css"),
];
const SKIN_DEFINE_RE = /(RHINE_TOKEN|SKIN_TOKEN|[A-Z_]*TOKENS?)\s*[:=]\s*\{/;

/** 递归收集文件 */
function walk(dir, acc = [], exts = [".ts", ".css", ".tsx"]) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir)) {
    if (ent === "node_modules" || ent === "client-dist" || ent === "dist" || ent === ".git") continue;
    const p = join(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc, exts);
    else if (exts.some((e) => ent.endsWith(e))) acc.push(p);
  }
  return acc;
}

/** 从 shell.css :root 提取色值形态（保留原文，用于后续比对） */
function extractTokenColors(css) {
  const colors = new Set();
  const re = /:\s*((?:#[0-9a-fA-F]{3,8})|(?:rgba?\([^)]*\)))/g;
  let m;
  while ((m = re.exec(css))) colors.add(cssColorKey(m[1]));
  return colors;
}

/** 归一 hex → 小写，rgb(a) → 规整空格 */
function cssColorKey(raw) {
  let c = raw.trim();
  if (c.startsWith("#")) return c.toLowerCase();
  c = c.replace(/\s+/g, " ");
  c = c.replace(/\(\s*/g, "(").replace(/\s*\)/g, ")").replace(/,\s*/g, ",");
  return c;
}

/** 扫描某个"非 token 源"文件里，是否出现任一已登记 token 色的字面量 */
function findViolations(file, tokenColors, isTokenSource) {
  const src = readFileSync(file, "utf-8");
  const out = [];
  if (isTokenSource) return out; // 白名单：token 源允许登记字面量

  for (const tc of tokenColors) {
    if (tc.includes("transparent")) continue; // 结构性，跳过
    // 文件内该色值的所有出现
    const literalRe = new RegExp(tc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const hits = [];
    let m;
    while ((m = literalRe.exec(src))) {
      const lineNum = src.slice(0, m.index).split("\n").length;
      hits.push({ lineNum });
    }
    if (!hits.length) continue;
    for (const h of hits) {
      const line = src.split("\n")[h.lineNum - 1] ?? "";
      const trimmed = line.trim();
      // 跳过注释行
      if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
      // 合法：该行通过 var()/color-mix() 引用了 token，或本身就是 token 定义（--x: <color>）
      if (line.includes("var(") || line.includes("color-mix(") || /--[\w-]+\s*:/.test(trimmed)) continue;
      // 否则：同一行含 token 色字面量却未引用 token → 硬编码违规
      out.push({ file, lineNum: h.lineNum, color: tc, line: trimmed.slice(0, 90) });
    }
  }
  return out;
}

function main() {
  const tokenColors = new Set();
  for (const f of TOKEN_FILES) for (const c of extractTokenColors(readFileSync(f, "utf-8"))) tokenColors.add(c);

  // 收集所有 UI 运行时文件（排除 token 源白名单）
  const all = walk(join(ROOT, "packages"));
  const tokenSourceSet = new Set(TOKEN_FILES.map((p) => resolve(p)));

  let violations = [];
  let tokenDefs = 0;
  for (const file of all) {
    const src = readFileSync(file, "utf-8");
    if (SKIN_DEFINE_RE.test(src)) {
      // 皮肤 token 常量定义处：从中也提取色值并入 tokenColors，且自身为白名单
      for (const c of extractTokenColors(src)) tokenColors.add(c);
      tokenSourceSet.add(resolve(file));
      tokenDefs++;
    }
  }

  for (const file of all) {
    if (tokenSourceSet.has(resolve(file))) continue;
    violations = violations.concat(findViolations(file, tokenColors, false));
  }

  if (violations.length) {
    console.error(`\u274c 硬编码色值违规 ${violations.length} 处（已知 token：${tokenColors.size} 个，皮肤源 ${tokenDefs} 个）：`);
    for (const v of violations.slice(0, 40)) {
      console.error(`  ${v.file.replace(ROOT + sep, "")}:${v.lineNum}  ${v.color}  ::  ${v.line.slice(0, 90)}`);
    }
    if (violations.length > 40) console.error(`  … 共 ${violations.length} 处`);
    process.exit(1);
  }
  console.log(`\u2713 no-hardcolor OK（token ${tokenColors.size} 个，扫描 ${all.length} 文件，无散色值违规）`);
}

main();