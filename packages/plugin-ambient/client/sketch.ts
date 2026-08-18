/**
 * plugin-ambient: client 端算法引擎
 *  - 原生 Canvas 2D（p5 风格，但不引 p5 库、不开 CDN，契合极简壳 + dsh 理念）
 *  - 背景层：缓慢移动的科研网格 + 漂移的三角十字星 + 斜向流星流光
 *  - 注入到 <vibe-shell> shadowRoot 的 .primary 容器，绝对定位铺满、pointer-events:none
 *  - 走 requestAnimationFrame，resize 重建 canvas，者组件卸载时销毁所有监听/RAF
 */

interface Star {
  x: number; y: number; r: number; vx: number; vy: number;
}
interface Meteor {
  x: number; y: number; vx: number; vy: number; len: number; life: number;
}
interface SphereP { cx: number; cy: number; r: number; ry: number; tiltPhase: number; }

/** 随机脉冲格：一个正在渐亮渐灭呼吸的格子位置 */
interface GlowCell {
  ix: number;      // 格列 index
  iy: number;      // 格行 index
  peak: number;    // 该格峰值透明度（多档：0.3~0.8 随机）
  phase: number;   // 呼吸相位起点（秒），用于错开
  kind: "blip" | "burst";  // blip=普通静噪格；burst=发源格(触发轴向扩散)
  /** burst 专属：发源时刻（elapsed 秒）。blip 忽略。 */
  born?: number;
}

/** 从 :root token 读取色值，转 "R,G,B" 三元组（供 canvas rgba() 拼装） */
function tokenRgb(name: string, fallback = "255,244,79"): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!v) return fallback;
    const m = v.match(/#([0-9a-fA-F]{6})/);
    if (m) {
      const n = parseInt(m[1], 16);
      return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    }
    // rgba(12,34,56,.7) 形式取前三个
    const rg = v.match(/rgba?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/);
    if (rg) return `${rg[1]},${rg[2]},${rg[3]}`;
    return fallback;
  } catch {
    return fallback;
  }
}

// 读 token（--accent 强调色 / --line 网格线），跟随全局/皮肤配色；失败回落原值。
// 注意：皮肤（如 plugin-skin-rhine）在 apply 阶段才向 :root 覆盖 token，而本模块顶层在 import 时就求值，
// 若在此设为 const 会把颜色锁死在默认值。故改为可变缓存 + refreshTokens() 在 token 变化时更新，
// 且只重读颜色、不触发整帧/整背景刷新。常态零开销；只有皮肤改 token 才补读一次。
let YELLOW = tokenRgb("--accent", "255,244,79"); // 强调色（默认深青 …/莱因皮肤柠檬黄）
let GRID = tokenRgb("--line", "#2b2f35");

/** 重新读取当前 :root 上相关 token，供 token 变化（皮肤切换）后刷新颜色缓存用 */
function refreshTokens(): void {
  YELLOW = tokenRgb("--accent", "255,244,79");
  GRID = tokenRgb("--line", "#2b2f35");
}

export class AmbientEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private stars: Star[] = [];
  private meteors: Meteor[] = [];
  private glowCells: GlowCell[] = [];      // 随机脉冲格集合（13 个活跃，落点换来换去）
  private sphereRot = 0;
  private spherePulse = 0;
  private w = 0;
  private h = 0;
  private start = performance.now();
  /** 监听 :root inline style 的 token 变更（皮肤切换），变了只重读颜色缓存，不整帧刷新 */
  private tokenObs: MutationObserver | null = null;
  /** 颜色读取版本：token 每次变化 +1，绘制时仅当版本变了才重读（其间帧内零开销） */
  private tokenRev = 0;

  attach(container: HTMLElement): void {
    // 清旧 canvas（重复 attach 兜底）
    const old = container.querySelector("canvas.ambient-bg");
    if (old && old.parentElement) old.parentElement.removeChild(old);
    const c = document.createElement("canvas");
    c.className = "ambient-bg";
    c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;";
    // 插到最前面：保证 DOM 顺序 < 实际内容，配合 .primary > :not() z-index:1 永远垫底
    container.insertBefore(c, container.firstChild);
    this.canvas = c;
    this.ctx = c.getContext("2d");
    this.resize();
    window.addEventListener("resize", this.onResize);
    this.initStars();
    // 首帧兜底：observer 挂上之前先主动同步一次当前配色，避免漏掉皮肤早已生效的情况
    refreshTokens();
    this.hookTokenObserver();
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.teardownTokenObserver();
    this.glowCells = [];                   // 清理随机脉冲格状态，避免重挂残留
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
  }

  /**
   * 挂 token 变更监听：只观察 document.documentElement 的 style 属性变化。
   * 皮肤（plugin-skin-rhine）用 root.style.setProperty(...) 写 inline token → 触发本观察 → 重读颜色。
   * 仅重读颜色变量，不重挂 canvas / 不重跑 initStars / 不重画整背景，下一帧 rAF 自然用新色。
   * 若某皮肤改用 <style> 样式表注入 token，此监听抓不到（需另行扩展），当前 rhine 走 inline 足够。
   */
  private hookTokenObserver(): void {
    if (typeof MutationObserver === "undefined" || this.tokenObs) return;
    this.tokenObs = new MutationObserver(() => {
      refreshTokens();
      this.tokenRev++;
    });
    this.tokenObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });
  }

  private teardownTokenObserver(): void {
    this.tokenObs?.disconnect();
    this.tokenObs = null;
  }

  private onResize = (): void => this.resize();

  private resize(): void {
    if (!this.canvas || !this.ctx || !this.canvas.parentElement) return;
    const box = this.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // 画布铺满容器可视区（clientHeight），不随内容滚动高度延伸——保持钉在视口。
    this.w = box.clientWidth;
    this.h = box.clientHeight;
    this.canvas.width = Math.max(1, this.w * dpr);
    this.canvas.height = Math.max(1, this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private initStars(): void {
    this.stars = [];
    const count = Math.round(Math.min(90, (this.w * this.h) / 12000));
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 0.6 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
      });
    }
    this.meteors = [];
    for (let i = 0; i < 4; i++) this.spawnMeteor(i * 0.25);
  }

  private spawnMeteor(phase: number): void {
    // 从右侧上部斜向左下滑动，缓慢
    const fromTop = Math.random() * this.h * 0.5;
    const angle = Math.PI * (0.72 + Math.random() * 0.2); // 朝左下
    const speed = 0.4 + Math.random() * 0.7;
    this.meteors.push({
      x: this.w * (0.7 + Math.random() * 0.5),
      y: fromTop,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      len: 40 + Math.random() * 70,
      life: phase,
    });
  }

  private loop = (t: number): void => {
    if (!this.ctx) return;
    const elapsed = this.start ? (t - this.start) / 1000 : 0;
    this.sphereRot = (this.sphereRot + 0.0016) % (Math.PI * 2);       // 每帧 0.09° → 约 62 秒转一圈，缓慢
    this.spherePulse = elapsed * 0.7;                                 // 球呼吸/轻微波动
    this.drawGrid(elapsed);
    this.drawSphere(this.ctx, elapsed);
    this.drawStars(this.ctx, elapsed);
    this.drawMeteors(this.ctx, elapsed);
    this.raf = requestAnimationFrame(this.loop);
  };

  /**
   * 科研网格（横向漂移已去掉，改为整体极淡的静态横竖细网格）
   *  - 网格基础透明度压到 0.2（相对背景很淡）
   *  - 每 6s 一圈：一条从右上角 → 左下角的斜向"脉冲光带"扫过，扫到处的网格线微微变亮
   *  - 光带沿斜线 x+y = const 平移（右上→左下），用线到光带中线的距离做高斯衰减
   */
  private drawGrid(elapsed: number): void {
    if (!this.ctx) return;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    // 深墨轨道渐变底（主区透露 if 插件未加载则纯色）
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.18, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    bg.addColorStop(0, "rgba(18,20,23,0.92)");
    bg.addColorStop(1, "rgba(9,11,13,0.98)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 脉冲参数：普通静噪格(单格呼吸) + 偶发发源格(轴向扩散涟漪)。
    //   - blip：13 格里多数格，单格 3s 一轮渐亮→渐灭，落点换来换去，无方向
    //   - burst：少数格，峰值 1.0 起爆，能量沿轴向(上/下/左/右)波前外扩 3 环，2s 走完
    //     衰减 环0=1.0 / 环1=0.5 / 环2=0.3 / 环3=0.18（缓衰减，第3环仍可见）
    const GLOW_COUNT = 13;                 // 同时活跃的发光格总数
    const BREATH_MS = 3000;                // blip 每格一轮时长（渐亮+渐灭）
    const BURST_DUR = 2;                   // burst 轴向扩散总时长（秒），走完 3 环
    const N_RINGS = 3;                     // 扩散环数（源点=环0，外扩 3 环）
    const DECAY = [1.0, 0.5, 0.3, 0.18];   // 环 0/1/2/3 亮度衰减（缓衰减）
    const MAX_BURST = 3;                   // 同时存活的发源格上限
    const BURST_RATE = 0.02;               // 每帧把随机 blip 升级为 burst 的概率（叠加随机）
    const BASE = 0.2;                      // 网格基础透明度（对齐需求"调淡到 0.2"）
    const cell = 42;                       // 网格单元（px）

    // 基础网格色：--line（GRID）；发光格色：--accent（YELLOW），皮肤驱动（默认深青/莱因柠檬黄）
    const gridRgb = GRID;
    const glowRgb = YELLOW;

    ctx.lineWidth = 1;
    // ① 基础网格：整屏横竖细线，统一极淡（--line 色，alpha BASE）
    for (let x = 0; x <= w + 1; x += cell) {
      ctx.strokeStyle = `rgba(${gridRgb},${BASE.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h + 1; y += cell) {
      ctx.strokeStyle = `rgba(${gridRgb},${BASE.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }

    // ② 随机脉冲格：维护 glowCells，分 blip(静噪) 与 burst(扩散)。
    const cols = Math.max(1, Math.ceil(w / cell));
    const rows = Math.max(1, Math.ceil(h / cell));
    const breathT = BREATH_MS / 1000;      // 3s

    // 过期清除：blip 走完一轮、burst 扩散彻底结束后移除（resize 越界也剔除）
    const ok = this.glowCells.filter((g) => {
      if (g.ix >= cols || g.iy >= rows) return false;
      if (g.kind === "burst") {
        const p = elapsed - (g.born ?? 0);
        return p < BURST_DUR + breathT; // 扩散主程+末尾呼吸窗口
      }
      return (elapsed + g.phase) % breathT < breathT - 0.05; // blip 3s 一轮
    });
    this.glowCells = ok;

    // 升级：偶尔把随机一个 blip 触发成 burst（叠加随机，非固定间隔）
    const burstCount = this.glowCells.filter((g) => g.kind === "burst").length;
    if (burstCount < MAX_BURST && Math.random() < BURST_RATE) {
      const blipIdx = this.glowCells.findIndex((g) => g.kind === "blip");
      if (blipIdx >= 0) {
        this.glowCells[blipIdx] = { ...this.glowCells[blipIdx], kind: "burst", born: elapsed };
      }
    }

    // 补足 blip（总槽数维持 GLOW_COUNT，burst 计入槽内）
    while (this.glowCells.length < GLOW_COUNT) {
      const ix = Math.floor(Math.random() * cols);
      const iy = Math.floor(Math.random() * rows);
      // 避免同格重复亮：撞位则换未占用格
      if (this.glowCells.some((g) => g.ix === ix && g.iy === iy)) {
        const free: Array<{ ix: number; iy: number }> = [];
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
          if (!this.glowCells.some((g) => g.ix === x && g.iy === y)) free.push({ ix: x, iy: y });
        if (free.length === 0) break;
        const pick = free[Math.floor(Math.random() * free.length)];
        this.glowCells.push({ ix: pick.ix, iy: pick.iy, peak: 0.35 + Math.random() * 0.55, phase: Math.random() * 3, kind: "blip" });
      } else {
        this.glowCells.push({ ix, iy, peak: 0.35 + Math.random() * 0.55, phase: Math.random() * 3, kind: "blip" });
      }
      if (this.glowCells.length >= GLOW_COUNT) break;
    }

    /** 画单个格子的四边 */
    const paintCell = (gx: number, gy: number, alpha: number): void => {
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows || alpha < 0.03) return;
      const x0 = gx * cell, y0 = gy * cell, x1 = x0 + cell, y1 = y0 + cell;
      ctx.strokeStyle = `rgba(${glowRgb},${alpha.toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(x0 + 0.5, y0); ctx.lineTo(x1 + 0.5, y0); ctx.stroke(); // 上
      ctx.beginPath(); ctx.moveTo(x0 + 0.5, y1); ctx.lineTo(x1 + 0.5, y1); ctx.stroke(); // 下
      ctx.beginPath(); ctx.moveTo(x0, y0 + 0.5); ctx.lineTo(x0, y1 + 0.5); ctx.stroke(); // 左
      ctx.beginPath(); ctx.moveTo(x1, y0 + 0.5); ctx.lineTo(x1, y1 + 0.5); ctx.stroke(); // 右
    };

    // 绘制 blip：按呼吸相位算亮度
    for (const g of this.glowCells) {
      if (g.kind !== "blip") continue;
      const t = (elapsed + g.phase) % breathT;  // 0..3s
      const frac = t / breathT;                  // 0..1
      const breath = Math.sin(Math.PI * frac);   // 渐亮→渐灭
      paintCell(g.ix, g.iy, g.peak * breath);
    }

    // 绘制 burst：源点峰值 1.0，沿 上/下/左/右 四轴逐环外扩 3 环，环内 0.5s 呼吸淡出。
    for (const g of this.glowCells) {
      if (g.kind !== "burst") continue;
      const p = elapsed - (g.born ?? 0);         // 扩散已走时长
      if (p < 0 || p > BURST_DUR + 0.5) continue;
      const delay = (r: number): number => (r * BURST_DUR) / N_RINGS; // 环 r 激活延迟
      const ringA = (r: number): number => {      // 该环当前呼吸亮度
        const fr = (p - delay(r)) / 0.5;          // 环内 0.5s 生命窗口
        if (fr < 0 || fr > 1) return 0;
        return DECAY[r] * Math.sin(Math.PI * fr); // 缓衰减，环3也可见
      };
      // 源点本身（环0）
      paintCell(g.ix, g.iy, ringA(0));
      // 四轴向：上/下/左/右，各外扩 N_RINGS 格
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of dirs) {
        for (let r = 1; r <= N_RINGS; r++) {
          paintCell(g.ix + dx * r, g.iy + dy * r, ringA(r));
        }
      }
    }
    // 旧的 168px 渐变主竖条已移除
  }

  /**
   * 3D 线框科研球（球面投影网格）
   *  - 18 经线 · 10 纬线，正交投影（无透视变形，契合"精密科研图"感）
   *  - 绕 Y 轴极慢自转 + 绕 X 轴固定 26° 倾斜 + 微小呼吸脉动
   *  - 背面(z<0)线透明，正面(z≥0)线按 z 深度渐变黄线
   *  - 赤道 / 0° 经线 / 两极 / 90° 经线稍亮，强化"球一样的东西"识别度
   */
  private drawSphere(c: CanvasRenderingContext2D, _elapsed: number): void {
    const { w, h } = this;
    // 球心：右上区域(科研图经典位)；半径按短边自适应 + 呼吸脉动
    const pulse = Math.sin(this.spherePulse) * 1.8;
    const cx = w * 0.73 + Math.sin(this.spherePulse * 0.37) * 6;
    const cy = h * 0.30 + Math.cos(this.spherePulse * 0.41) * 5;
    const baseR = Math.min(w, h) * 0.285 + pulse;
    if (baseR < 20) return;
    const tiltX = 0.45 + Math.sin(this.spherePulse * 0.2) * 0.025; // ~26° 轴倾斜
    const rotY = this.sphereRot;
    const sinX = Math.sin(tiltX), cosX = Math.cos(tiltX);
    const sinY = Math.sin(rotY), cosY = Math.cos(rotY);

    // 经纬度 → 3D 球面点 → 旋转 → 正交投影 2D
    const project = (lat: number, lon: number): { x: number; y: number; z: number } => {
      // lat: -π/2(南极) ~ π/2(北极)  lon: 0 ~ 2π
      const x0 = Math.cos(lat) * Math.sin(lon);
      const y0 = Math.sin(lat);
      const z0 = Math.cos(lat) * Math.cos(lon);
      // 绕 Y 轴自转
      const x1 = x0 * cosY + z0 * sinY;
      const z1 = -x0 * sinY + z0 * cosY;
      const y1 = y0;
      // 绕 X 轴倾斜
      const y2 = y1 * cosX - z1 * sinX;
      const z2 = y1 * sinX + z1 * cosX;
      const x2 = x1;
      return {
        x: cx + x2 * baseR,
        y: cy - y2 * baseR, // Canvas y 向下，翻转
        z: z2,               // 正交投影保留 z 做深度着色
      };
    };

    const LON_STEPS = 18;      // 经线数量
    const LAT_STEPS = 10;      // 纬线（不含两极）段数 → 产生 9 条纬度圈
    const SEG = 28;            // 每条线上细分段数（越密越圆）

    // --- 纬线：latitude rings（先画，细且最淡） ---
    c.lineWidth = 0.8;
    for (let i = 1; i <= LAT_STEPS - 1; i++) {
      const lat = -Math.PI / 2 + (Math.PI * i) / LAT_STEPS;
      // 90°/赤道（i≈LAT_STEPS/2）稍亮
      const isEquator = i === Math.floor(LAT_STEPS / 2);
      c.beginPath();
      let started = false;
      let prevZ = 0;
      for (let s = 0; s <= SEG; s++) {
        const lon = (2 * Math.PI * s) / SEG;
        const p = project(lat, lon);
        const alpha = p.z >= 0
          ? (isEquator ? 0.15 + 0.28 * (p.z * 0.5 + 0.5) : 0.07 + 0.16 * (p.z * 0.5 + 0.5))
          : (isEquator ? 0.05 : 0.025);
        if (!started) { c.moveTo(p.x, p.y); started = true; prevZ = p.z; }
        else {
          // 穿越地平线(z 正负切换)时断开，避免背面亮线横连
          if ((prevZ >= 0) !== (p.z >= 0)) {
            c.strokeStyle = `rgba(${YELLOW},${alpha})`;
            c.stroke();
            c.beginPath();
            c.moveTo(p.x, p.y);
          } else {
            c.lineTo(p.x, p.y);
          }
          prevZ = p.z;
        }
      }
      c.strokeStyle = isEquator
        ? `rgba(${YELLOW},${(0.17 + 0.2).toFixed(3)})`
        : `rgba(${YELLOW},0.11)`;
      c.stroke();
    }

    // --- 经线：meridians（稍粗，主骨架） ---
    c.lineWidth = 1.0;
    for (let i = 0; i < LON_STEPS; i++) {
      const lon0 = (2 * Math.PI * i) / LON_STEPS;
      const isPrime = i === 0 || i === Math.floor(LON_STEPS / 2); // 0° & 180°主经线
      const is90 = i === Math.floor(LON_STEPS / 4) || i === Math.floor((3 * LON_STEPS) / 4);
      c.beginPath();
      let started = false;
      let prevZ = 0;
      for (let s = 0; s <= SEG; s++) {
        const lat = -Math.PI / 2 + (Math.PI * s) / SEG;
        const p = project(lat, lon0);
        const front = p.z >= 0;
        const depthA = front
          ? (isPrime || is90 ? 0.18 + 0.30 * (p.z * 0.5 + 0.5) : 0.09 + 0.17 * (p.z * 0.5 + 0.5))
          : (isPrime ? 0.05 : 0.022);
        if (!started) { c.moveTo(p.x, p.y); started = true; prevZ = p.z; }
        else {
          if ((prevZ >= 0) !== front) {
            // 到极点/穿地平线 → 先把已有段描成前/后半的颜色，重开新段
            c.strokeStyle = `rgba(${YELLOW},${depthA})`;
            c.stroke();
            c.beginPath();
            c.moveTo(p.x, p.y);
          } else {
            c.lineTo(p.x, p.y);
          }
          prevZ = p.z;
        }
      }
      c.strokeStyle = (isPrime || is90) ? `rgba(${YELLOW},0.24)` : `rgba(${YELLOW},0.14)`;
      c.stroke();
    }

    // --- 主标记：两极高亮点 + 赤道外圈柔光 ---
    const np = project(Math.PI / 2, 0);
    const sp = project(-Math.PI / 2, 0);
    // 北极
    c.fillStyle = `rgba(${YELLOW},${np.z >= 0 ? 0.55 : 0.15})`;
    c.beginPath(); c.arc(np.x, np.y, np.z >= 0 ? 2.6 : 1.2, 0, Math.PI * 2); c.fill();
    // 南极
    c.fillStyle = `rgba(${YELLOW},${sp.z >= 0 ? 0.45 : 0.12})`;
    c.beginPath(); c.arc(sp.x, sp.y, sp.z >= 0 ? 2.2 : 1.0, 0, Math.PI * 2); c.fill();
    // 外轮廓圆（科研球外框包络，1px 淡）
    c.strokeStyle = `rgba(${YELLOW},0.16)`;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, baseR, 0, Math.PI * 2);
    c.stroke();
    // 外框二次高光(右上象限，伪光照)
    const rim = c.createRadialGradient(cx - baseR * 0.35, cy - baseR * 0.45, baseR * 0.05, cx, cy, baseR);
    rim.addColorStop(0, `rgba(${YELLOW},0.20)`);
    rim.addColorStop(0.42, `rgba(${YELLOW},0.03)`);
    rim.addColorStop(1, `rgba(${YELLOW},0)`);
    c.fillStyle = rim;
    c.beginPath();
    c.arc(cx, cy, baseR, 0, Math.PI * 2);
    c.fill();
  }

  private drawStars(c: CanvasRenderingContext2D, elapsed: number): void {
    const { w, h } = this;
    for (const s of this.stars) {
      s.x += s.vx; s.y += s.vy;
      if (s.x < -4) s.x = w + 4; if (s.x > w + 4) s.x = -4;
      if (s.y < -4) s.y = h + 4; if (s.y > h + 4) s.y = -4;
      // 缓慢呼吸闪烁
      const tw = 0.5 + 0.5 * Math.sin(elapsed * (0.6 + s.r) + s.x);
      const a = 0.12 + 0.4 * tw;
      c.fillStyle = `rgba(${YELLOW},${a.toFixed(3)})`;
      // 三角十字星：两段垂直线段
      const r = s.r + 0.6;
      c.beginPath();
      c.moveTo(s.x, s.y - r * 2.2); c.lineTo(s.x, s.y + r * 2.2);
      c.moveTo(s.x - r * 2.2, s.y); c.lineTo(s.x + r * 2.2, s.y);
      c.strokeStyle = `rgba(${YELLOW},${a.toFixed(3)})`;
      c.lineWidth = 1;
      c.stroke();
      c.fillRect(s.x - 0.5, s.y - 0.5, 1, 1);
    }
  }

  private drawMeteors(c: CanvasRenderingContext2D, elapsed: number): void {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.life += 0.0012; // 极慢生成节奏
      m.x += m.vx; m.y += m.vy;
      // 生命周期：越界或寿命耗尽则重生
      if (m.x > this.w + 60 || m.y > this.h + 60 || m.life > 2.4) {
        this.meteors.splice(i, 1);
        continue;
      }
      const tailAngle = Math.atan2(m.vy, m.vx);
      const tx = m.x - Math.cos(tailAngle) * m.len;
      const ty = m.y - Math.sin(tailAngle) * m.len;
      // 头亮尾淡
      const head = c.createLinearGradient(m.x, m.y, tx, ty);
      const a = Math.max(0, 0.55 - (m.life - 1) * 0.4);
      head.addColorStop(0, `rgba(${YELLOW},${a.toFixed(3)})`);
      head.addColorStop(1, `rgba(${YELLOW},0)`);
      c.strokeStyle = head;
      c.lineWidth = 1.6;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(m.x, m.y);
      c.lineTo(tx, ty);
      c.stroke();
      // 头部亮点
      c.fillStyle = `rgba(${YELLOW},${(a + 0.2).toFixed(3)})`;
      c.beginPath();
      c.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
      c.fill();
    }
    // 缓慢补充流星
    if (this.meteors.length < 4 && Math.random() < 0.002) this.spawnMeteor(0);
  }
}