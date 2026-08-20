// vibepm 侧栏 2 修复复测（真实鼠标 + Endfield 机制）：Chrome headless + CDP
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9353;
const APP = "http://127.0.0.1:5199";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1200, H = 760;

const userData = mkdtempSync(join(tmpdir(), "vibepm-cdp5-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userData}`,
  `--window-size=${W},${H}`, "about:blank",
], { stdio: "ignore" });

let errors = [];
async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error("CDP not ready");
}

async function main() {
  const wsUrl = await getTarget();
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      errors.push("EXC: " + (msg.params?.exceptionDetails?.exception?.description ?? msg.params?.exceptionDetails?.text ?? ""));
    } else if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params?.type)) {
      const txt = (msg.params?.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
      errors.push("CONSOLE[" + msg.params.type + "]: " + txt);
    }
  };
  await new Promise((r) => { ws.onopen = r; });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: APP });
  await sleep(3500);
  const evalJS = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return res?.result?.value;
  };
  const mouse = async (type, x, y, btn = "none") => {
    await send("Input.dispatchMouseEvent", { type, x, y, button: btn, clickCount: type === "mousePressed" || type === "mouseReleased" ? 1 : 0 });
    await sleep(60);
  };
  const state = () => evalJS(`(() => {
    const root = document.querySelector('vibe-shell').shadowRoot;
    const nav = root.querySelector('.nav');
    const indi = root.querySelector('.nav-indi');
    const act = root.querySelector('.nav-item.active');
    const item = root.querySelector('.nav-item');
    return {
      railW: nav.offsetWidth, itemW: item ? item.offsetWidth : -1,
      mainClass: root.querySelector('.main').className,
      hash: location.hash,
      active: act ? act.querySelector('.nav-label')?.textContent : '',
      indiTop: indi.style.top, indiOp: indi.style.opacity,
      labelOp: root.querySelector('.nav-item .nav-label') ? getComputedStyle(root.querySelector('.nav-item .nav-label')).opacity : '',
      switcherLeft: getComputedStyle(root.querySelector('.nav-switch')).left,
      bgBefore: (() => { const n = root.querySelector('.nav'); const cs = getComputedStyle(n, '::before'); const r = n.getBoundingClientRect(); return { transform: cs.transform, width: cs.width, shadow: cs.boxShadow, navW: r.width }; })(),
      rowRects: [...root.querySelectorAll('.nav-item')].map(r => { const b = r.getBoundingClientRect(); return { label: r.querySelector('.nav-label').textContent, x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }; }),
    };
  })()`);

  console.log("== 初始(home) ==");
  console.log(JSON.stringify(await state(), null, 2));

  // 1) 鼠标移入 rail(68px 内 x=40) → mouseenter → 展开
  await mouse("mouseMoved", 40, 300);
  await sleep(400);
  const s1 = await state();
  console.log("== 移入 rail 后 ==");
  console.log(JSON.stringify(s1, null, 2));

  // 2) 点「偏好设置」行（真实坐标）→ 切 #settings → rail 应保持展开
  const target = s1.rowRects.find(r => r.label === "偏好设置");
  await mouse("mouseMoved", target.x, target.y);
  await sleep(150);
  await mouse("mousePressed", target.x, target.y, "left");
  await mouse("mouseReleased", target.x, target.y, "left");
  await sleep(700);
  const s2 = await state();
  console.log("== 点偏好设置(切 tab 后) ==");
  console.log(JSON.stringify(s2, null, 2));

  // 3) 移出 rail(x=500) → mouseleave → 收回
  await mouse("mouseMoved", 500, 300);
  await sleep(500);
  console.log("== 移出 rail 后 ==");
  console.log(JSON.stringify(await state(), null, 2));

  // 4) 空白区点击（展开态 rail 内、无行处 x=150,y=650）→ 不应刷新/切路由
  await mouse("mouseMoved", 40, 400);
  await sleep(400);
  const before = await state();
  await mouse("mouseMoved", 150, 660);
  await sleep(200);
  await mouse("mousePressed", 150, 660, "left");
  await mouse("mouseReleased", 150, 660, "left");
  await sleep(500);
  const afterBlank = await state();
  console.log("== 点展开态空白区(不应刷新) ==");
  console.log(JSON.stringify({ hashSame: before.hash === afterBlank.hash, railSame: before.railW === afterBlank.railW, after: afterBlank }, null, 2));

  // 5) switcher：点它手动收起（rail-open → false）
  const sw = await evalJS(`(() => { const r = document.querySelector('vibe-shell').shadowRoot.querySelector('.nav-switch').getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; })()`);
  await mouse("mouseMoved", sw.x, sw.y);
  await sleep(100);
  await mouse("mousePressed", sw.x, sw.y, "left");
  await mouse("mouseReleased", sw.x, sw.y, "left");
  await sleep(500);
  console.log("== 点 switcher 手动收 ==");
  console.log(JSON.stringify(await state(), null, 2));

  console.log("== 页面错误 ==");
  console.log(errors.length ? errors.join("\n") : "(无)");

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error("FAIL:", e); chrome.kill(); process.exit(1); });
