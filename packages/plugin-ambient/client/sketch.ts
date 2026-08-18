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

// 读 token（--accent 强调色 / --line 网格线），跟随全局/皮肤配色；失败回落原值
const YELLOW = tokenRgb("--accent", "255,244,79"); // 强调色（默认深青 …/列表皮肤柠檬黄）
const GRID = tokenRgb("--line", "#2b2f35");
const GRID_MAJOR = tokenRgb("--line-strong", "#3a4046");

export class AmbientEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private stars: Star[] = [];
  private meteors: Meteor[] = [];
  private gridOffset = 0;
  private sphereRot = 0;
  private spherePulse = 0;
  private w = 0;
  private h = 0;
  private start = performance.now();

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
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
  }

  private onResize = (): void => this.resize();

  private resize(): void {
    if (!this.canvas || !this.ctx || !this.canvas.parentElement) return;
    const box = this.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    this.gridOffset = (this.gridOffset + 0.06) % 42;
    this.sphereRot = (this.sphereRot + 0.0016) % (Math.PI * 2);       // 每帧 0.09° → 约 62 秒转一圈，缓慢
    this.spherePulse = elapsed * 0.7;                                 // 球呼吸/轻微波动
    this.drawGrid();
    this.drawSphere(this.ctx, elapsed);
    this.drawStars(this.ctx, elapsed);
    this.drawMeteors(this.ctx, elapsed);
    this.raf = requestAnimationFrame(this.loop);
  };

  private drawGrid(): void {
    if (!this.ctx) return;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    // 深墨轨道渐变底（主区透露 if 插件未加载则纯色）
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.18, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    bg.addColorStop(0, "rgba(18,20,23,0.92)");
    bg.addColorStop(1, "rgba(9,11,13,0.98)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // 科研网格：缓慢横向漂移
    ctx.lineWidth = 1;
    const off = this.gridOffset;
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    for (let x = off - 42; x < w + 42; x += 42) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = off - 42; y < h + 42; y += 42) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();
    // 主网格线（渐变淡出左端）
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(58,64,71,0)");
    grad.addColorStop(0.35, `rgb(${GRID_MAJOR})`);
    grad.addColorStop(1, "rgba(58,64,71,0.35)");
    ctx.strokeStyle = grad;
    ctx.beginPath();
    for (let x = (off % 168) - 168; x < w + 168; x += 168) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    ctx.stroke();
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