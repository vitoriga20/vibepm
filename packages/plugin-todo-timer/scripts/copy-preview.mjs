// 构建后把 preview 静态页拷贝进 client-dist（经壳 /plugins/<id>/preview/** 服务）
// 注：fs.cpSync 递归拷贝大目录在 Windows node 会崩（0xC0000139），改用手动递归。
import { mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";

const src = "client/preview";
const dst = "client-dist/preview";

function copyAll(from, to) {
  for (const name of readdirSync(from)) {
    const s = join(from, name);
    const t = join(to, name);
    if (statSync(s).isDirectory()) {
      copyAll(s, t);
    } else {
      mkdirSync(to, { recursive: true });
      copyFileSync(s, t);
    }
  }
}

copyAll(src, dst);
console.log("copied client/preview -> client-dist/preview");
