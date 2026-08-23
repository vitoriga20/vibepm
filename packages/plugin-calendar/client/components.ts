/**
 * calendar-panel：活动日历面板（月视图）
 *  - 数据：GET /api/calendar/days（本插件 node 半 → todoTimer 服务聚合投影）
 *  - 维度：专注强度（accent 底色深浅）+ 当日完成任务数 + 长目标投入堆叠条（按计划派生色相）
 *  - 实时性：面板可见时 3s 轮询 + visibilitychange 即时拉取（不刷新页面即可看到最新数据）
 *  - 颜色全走壳皮肤 token（var(--*)），主题换肤自动跟随；长目标色相由计划 id 派生（数据系列色）
 */
import { CALENDAR_API_PATH, MS_PER_MINUTE } from "../src/api.js";

// ———— 用户可见文案单一源（全链引用，禁止散写字面量） ————
const UI_TEXT = {
  weekdays: ["日", "一", "二", "三", "四", "五", "六"],
  monthTitle: (y: number, m: number) => `${y} 年 ${m + 1} 月`,
  prevMonth: "上个月",
  nextMonth: "下个月",
  todayBtn: "今天",
  emptyTitle: "还没有同步到数据",
  emptyHint: "数据来自「TODO番茄钟」面板；在本机浏览器打开一次番茄钟即可自动同步。",
  loadFail: "数据拉取失败，稍后自动重试",
  legendFocus: "专注强度",
  legendDone: "完成任务",
  legendPlan: "长目标投入",
  monthSummary: (h: number, m: number, t: number, d: number) =>
    `本月专注 ${h > 0 ? `${h} 小时 ` : ""}${m} 分钟 · ${t} 番茄 · 完成 ${d} 条`,
  // 单元格徽标
  focusBadge: (min: number) => (min >= 60 ? `${Math.floor(min / 60)}时${min % 60}分` : `${min}分`),
  doneBadge: (n: number) => `✓${n}`,
  // tooltip（原生 title，多行 \n）
  tipFocus: (min: number, t: number) => `专注 ${min} 分钟 · ${t} 番茄`,
  tipDone: (n: number, titles: string[]) => `完成任务 ${n} 条：${titles.join("、")}`,
  tipPlan: (title: string, min: number) => `${title} ${min} 分钟`,
  noActivity: "当日无活动",
  // 详情卡
  detailTitle: (key: string) => `${key} · 活动详情`,
  detailFocus: (min: number, t: number) => `专注 ${min} 分钟（${t} 番茄）`,
  detailDoneTitle: "完成的任务：",
  detailPlanTitle: "长目标投入：",
  detailEmpty: "当日无活动",
  detailPlanRow: (title: string, min: number, pct: number) => `${title} — ${min} 分钟（${pct}%）`,
  updatedAt: (t: number) => {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `数据更新于 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  },
  syncPending: "等待番茄钟上报…",
};

/** 客户端本地日期键（口径同 todoTimer 契约 localDateKey；浏览器 bundle 无法跨包 import，语义副本） */
function localKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 计划系列色：按 id 黄金角旋转派生稳定色相（数据系列色，非主题 token） */
function planHue(planId: number): string {
  const h = (planId * 137.508) % 360;
  return `hsl(${h.toFixed(1)} 38% 45%)`;
}

function fmtMin(ms: number): number {
  return Math.round(ms / MS_PER_MINUTE);
}

interface DayAggLite {
  focusMs: number;
  focusCount: number;
  doneCount: number;
  doneTitles: string[];
  planMs: Record<string, number>;
}
interface PlanLite {
  id: number;
  title: string;
  state: string;
  milestones: Array<{ id: string; title: string }>;
}
interface DaysPayload {
  ok: boolean;
  updatedAt: number | null;
  days: Record<string, DayAggLite>;
  plans: PlanLite[];
  todayKey: string;
}

const CSS = /* css */`
:host{display:block;padding:4px 2px;font-family:var(--sans,sans-serif);color:var(--fg,#333)}
.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.bar .title{font-size:18px;font-weight:700;letter-spacing:1px;color:var(--fg,#222)}
.bar button{border:1px solid var(--line-strong,#ccc);background:var(--panel,#fff);color:var(--fg,#333);
  padding:5px 12px;cursor:pointer;font:600 12px/1 var(--sans,sans-serif);border-radius:var(--radius-s,4px);
  transition:border-color .15s,color .15s}
.bar button:hover{border-color:var(--accent,#147d78);color:var(--accent,#147d78)}
.bar .today-btn{border-color:var(--accent-line,#0f6a66);color:var(--accent,#147d78)}
.summary{font-size:12px;color:var(--muted,#6b6f76);width:100%;font-family:var(--numeric,monospace)}
.updated{font-size:11px;color:var(--dim,#858a91)}
.err{color:var(--danger,#b3402e)}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.wk{font-size:11px;color:var(--muted,#6b6f76);text-align:center;padding:4px 0;letter-spacing:2px}
.cell{position:relative;min-height:74px;border:1px solid var(--line,#dcdad1);border-radius:var(--radius-s,4px);
  background:var(--panel,#fff);padding:6px 7px;cursor:pointer;overflow:hidden;
  transition:border-color .15s,transform .1s}
.cell:hover{border-color:var(--accent,#147d78)}
.cell.sel{outline:2px solid var(--accent,#147d78);outline-offset:-2px}
.cell.other{opacity:.42;background:var(--panel-alt,#f1f0ea)}
.cell.today .d{color:var(--accent,#147d78);font-weight:900}
.cell .d{font:700 12px/1 var(--numeric,monospace);color:var(--muted,#6b6f76)}
.cell .focus{display:inline-block;margin-top:5px;font:700 10px/1 var(--numeric,monospace);
  color:var(--accent,#147d78);background:var(--accent-dim,#e3efee);padding:2px 5px;border-radius:3px}
.cell .done{position:absolute;top:6px;right:7px;font:700 10px/1 var(--numeric,monospace);color:var(--ink-ok,#4d7a5e)}
.cell .plans{position:absolute;left:0;right:0;bottom:0;display:flex;height:5px}
.cell .plans i{display:block;height:100%}
.detail{margin-top:14px;border:1px solid var(--line,#dcdad1);border-left:3px solid var(--accent,#147d78);
  background:var(--panel-alt,#f1f0ea);padding:12px 14px;border-radius:var(--radius-s,4px)}
.detail h3{margin:0 0 8px;font-size:14px;color:var(--fg,#222);font-weight:800}
.detail .row{font-size:12px;color:var(--text,#333);margin:3px 0}
.detail ul{margin:3px 0 3px 18px;padding:0;font-size:12px;color:var(--text,#333)}
.detail ul li{margin:2px 0}
.legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:11px;color:var(--muted,#6b6f76)}
.legend .sw{display:inline-block;width:14px;height:8px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.legend .plan-chip{display:inline-flex;align-items:center;margin-right:10px}
.empty{padding:38px 20px;text-align:center;border:1px dashed var(--line-strong,#cfccc2);border-radius:var(--radius-s,4px)}
.empty .t{font-size:15px;font-weight:800;color:var(--fg,#222);margin-bottom:6px}
.empty .h{font-size:12px;color:var(--muted,#6b6f76)}
`;

export class CalendarPanel extends HTMLElement {
  static readonly POLL_MS = 3000;
  private _poll: ReturnType<typeof setInterval> | null = null;
  private _cursor = new Date();
  private _selected: string | null = null;
  private _data: DaysPayload | null = null;
  private _loadErr = false;

  connectedCallback(): void {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.innerHTML = `<style>${CSS}</style><div class="wrap" id="wrap">…</div>`;
    void this.fetchData();
    this._poll = setInterval(() => {
      if (!document.hidden) void this.fetchData();
    }, CalendarPanel.POLL_MS);
    document.addEventListener("visibilitychange", this._onVis);
  }

  disconnectedCallback(): void {
    if (this._poll) clearInterval(this._poll);
    this._poll = null;
    document.removeEventListener("visibilitychange", this._onVis);
  }

  private _onVis = (): void => {
    if (!document.hidden && this.isConnected) void this.fetchData();
  };

  private async fetchData(): Promise<void> {
    try {
      const r = await fetch(CALENDAR_API_PATH);
      const data = await r.json() as DaysPayload;
      this._data = data;
      this._loadErr = false;
    } catch {
      this._loadErr = true;
    }
    if (this.isConnected) this.render();
  }

  /** 里程碑 id →「计划 · 里程碑」标题（缺失兜底，不报错） */
  private _milestoneTitle(id: string): string {
    for (const p of this._data?.plans ?? []) {
      const ms = p.milestones.find((m) => m.id === id);
      if (ms) return `${p.title} · ${ms.title}`;
    }
    return id;
  }

  private render(): void {
    const s = this.shadowRoot!;
    const wrap = s.getElementById("wrap")!;
    const data = this._data;

    // 空态：node 半尚无任何上报（本机还没打开过番茄钟）→ 引导而非空白格
    if (!data || data.updatedAt == null) {
      wrap.innerHTML = `<div class="empty"><div class="t"></div><div class="h"></div></div>`;
      (wrap.querySelector(".t") as HTMLElement).textContent = UI_TEXT.emptyTitle;
      (wrap.querySelector(".h") as HTMLElement).textContent = UI_TEXT.emptyHint;
      return;
    }

    const days = data?.days ?? {};
    const plans = data?.plans ?? [];
    const todayKey = data?.todayKey ?? localKey(new Date());

    // ---- 顶栏：月份导航 + 本月汇总 ----
    const y = this._cursor.getFullYear();
    const m = this._cursor.getMonth();
    let sumFocusMs = 0, sumTomato = 0, sumDone = 0;
    const prefix = `${y}-${String(m + 1).padStart(2, "0")}`;
    for (const [k, d] of Object.entries(days)) {
      if (!k.startsWith(prefix)) continue;
      sumFocusMs += d.focusMs; sumTomato += d.focusCount; sumDone += d.doneCount;
    }
    const sumMin = fmtMin(sumFocusMs);

    wrap.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "bar";
    const mkBtn = (label: string, title: string, fn: () => void, cls = ""): HTMLButtonElement => {
      const b = document.createElement("button");
      b.textContent = label;
      b.title = title;
      if (cls) b.className = cls;
      b.addEventListener("click", fn);
      return b;
    };
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = UI_TEXT.monthTitle(y, m);
    bar.append(
      mkBtn("‹", UI_TEXT.prevMonth, () => this._shiftMonth(-1)),
      title,
      mkBtn("›", UI_TEXT.nextMonth, () => this._shiftMonth(1)),
      mkBtn(UI_TEXT.todayBtn, UI_TEXT.todayBtn, () => {
        this._cursor = new Date();
        this._selected = todayKey;
        this.render();
      }, "today-btn"),
    );
    const sum = document.createElement("div");
    sum.className = "summary";
    sum.textContent = UI_TEXT.monthSummary(Math.floor(sumMin / 60), sumMin % 60, sumTomato, sumDone);
    bar.appendChild(sum);
    if (data?.updatedAt) {
      const up = document.createElement("div");
      up.className = "updated";
      up.textContent = UI_TEXT.updatedAt(data.updatedAt);
      bar.appendChild(up);
    } else {
      const up = document.createElement("div");
      up.className = "updated";
      up.textContent = UI_TEXT.syncPending;
      bar.appendChild(up);
    }
    if (this._loadErr) {
      const err = document.createElement("div");
      err.className = "updated err";
      err.textContent = UI_TEXT.loadFail;
      bar.appendChild(err);
    }
    wrap.appendChild(bar);

    // ---- 月格：周日起始 6 行（与番茄钟统计日历同一习惯）----
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const w of UI_TEXT.weekdays) {
      const el = document.createElement("div");
      el.className = "wk";
      el.textContent = w;
      grid.appendChild(el);
    }
    const first = new Date(y, m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay()); // 回退到本月首个周日
    const cursor = new Date(start);
    for (let i = 0; i < 42; i++) {
      grid.appendChild(this._renderCell(cursor, days, todayKey));
      cursor.setDate(cursor.getDate() + 1);
    }
    wrap.appendChild(grid);

    // ---- 详情卡 + 图例 ----
    const detailKey = this._selected && days[this._selected] ? this._selected
      : (days[todayKey] ? todayKey : null);
    if (detailKey) wrap.appendChild(this._renderDetail(detailKey, days[detailKey]));
    wrap.appendChild(this._renderLegend(plans));
  }

  private _shiftMonth(delta: number): void {
    this._cursor = new Date(this._cursor.getFullYear(), this._cursor.getMonth() + delta, 1);
    this.render();
  }

  /** 单元格：底色 = 专注强度（accent 透明度分层）；徽标 = 分钟/完成数；底条 = 长目标堆叠 */
  private _renderCell(d: Date, days: Record<string, DayAggLite>, todayKey: string): HTMLElement {
    const key = localKey(d);
    const agg = days[key];
    const cell = document.createElement("div");
    cell.className = "cell"
      + (d.getMonth() !== this._cursor.getMonth() ? " other" : "")
      + (key === todayKey ? " today" : "")
      + (key === this._selected ? " sel" : "");
    const num = document.createElement("span");
    num.className = "d";
    num.textContent = String(d.getDate());
    cell.appendChild(num);

    if (agg) {
      // 专注强度：0-15/30/60/120 分钟 → 18%→55% accent（线性分层，视觉可辨）
      const min = fmtMin(agg.focusMs);
      if (min > 0) {
        const lv = Math.min(1, Math.max(0.18, Math.log2(Math.max(min, 1) / 8 + 1) / 4.6));
        const pct = Math.round(lv * 55);
        cell.style.background = `color-mix(in srgb, var(--accent) ${pct}%, var(--panel))`;
        const fb = document.createElement("span");
        fb.className = "focus";
        fb.textContent = UI_TEXT.focusBadge(min);
        cell.appendChild(fb);
      }
      if (agg.doneCount > 0) {
        const db = document.createElement("span");
        db.className = "done";
        db.textContent = UI_TEXT.doneBadge(agg.doneCount);
        cell.appendChild(db);
      }
      // 长目标堆叠底条：宽度按各里程碑当日占比
      const planTotal = Object.values(agg.planMs).reduce((a, b) => a + b, 0);
      if (planTotal > 0) {
        const stack = document.createElement("div");
        stack.className = "plans";
        // 里程碑 id 形如 "p1m2" → 计划 id = 1（色相按计划派生，同计划同色）
        for (const [msId, ms] of Object.entries(agg.planMs)) {
          const seg = document.createElement("i");
          const planId = Number(msId.match(/^p(\d+)m/)?.[1] ?? 0) || 0;
          seg.style.flex = String(ms);
          seg.style.background = planHue(planId);
          seg.title = UI_TEXT.tipPlan(this._milestoneTitle(msId), fmtMin(ms));
          stack.appendChild(seg);
        }
        cell.appendChild(stack);
      }
      cell.title = this._cellTooltip(key, agg);
    } else {
      cell.title = `${key}\n${UI_TEXT.noActivity}`;
    }
    cell.addEventListener("click", () => {
      this._selected = key;
      this.render();
    });
    return cell;
  }

  private _cellTooltip(key: string, agg: DayAggLite): string {
    const lines: string[] = [key];
    if (agg.focusMs > 0 || agg.focusCount > 0) lines.push(UI_TEXT.tipFocus(fmtMin(agg.focusMs), agg.focusCount));
    if (agg.doneCount > 0) lines.push(UI_TEXT.tipDone(agg.doneCount, agg.doneTitles));
    for (const [msId, ms] of Object.entries(agg.planMs)) {
      lines.push(UI_TEXT.tipPlan(this._milestoneTitle(msId), fmtMin(ms)));
    }
    if (lines.length === 1) lines.push(UI_TEXT.noActivity);
    return lines.join("\n");
  }

  private _renderDetail(key: string, agg: DayAggLite): HTMLElement {
    const box = document.createElement("div");
    box.className = "detail";
    const h = document.createElement("h3");
    h.textContent = UI_TEXT.detailTitle(key);
    box.appendChild(h);
    if (agg.focusMs > 0) {
      const r = document.createElement("div");
      r.className = "row";
      r.textContent = UI_TEXT.detailFocus(fmtMin(agg.focusMs), agg.focusCount);
      box.appendChild(r);
    }
    if (agg.doneTitles.length) {
      const r = document.createElement("div");
      r.className = "row";
      r.textContent = UI_TEXT.detailDoneTitle;
      box.appendChild(r);
      const ul = document.createElement("ul");
      for (const t of agg.doneTitles) {
        const li = document.createElement("li");
        li.textContent = t;
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
    const planEntries = Object.entries(agg.planMs).sort((a, b) => b[1] - a[1]);
    if (planEntries.length) {
      const r = document.createElement("div");
      r.className = "row";
      r.textContent = UI_TEXT.detailPlanTitle;
      box.appendChild(r);
      const total = planEntries.reduce((a, e) => a + e[1], 0);
      const ul = document.createElement("ul");
      for (const [msId, ms] of planEntries) {
        const li = document.createElement("li");
        const pct = Math.round((ms / total) * 100);
        li.textContent = UI_TEXT.detailPlanRow(this._milestoneTitle(msId), fmtMin(ms), pct);
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
    if (!agg.focusMs && !agg.doneTitles.length && !planEntries.length) {
      const r = document.createElement("div");
      r.className = "row";
      r.textContent = UI_TEXT.detailEmpty;
      box.appendChild(r);
    }
    return box;
  }

  private _renderLegend(plans: PlanLite[]): HTMLElement {
    const legend = document.createElement("div");
    legend.className = "legend";
    const mk = (label: string, swStyle: Partial<CSSStyleDeclaration>): void => {
      const item = document.createElement("span");
      const sw = document.createElement("i");
      sw.className = "sw";
      Object.assign(sw.style, swStyle);
      item.appendChild(sw);
      item.appendChild(document.createTextNode(label));
      legend.appendChild(item);
    };
    mk(UI_TEXT.legendFocus, { background: "var(--accent)" });
    mk(UI_TEXT.legendDone, { background: "var(--ink-ok)" });
    if (plans.length) {
      const wrap = document.createElement("span");
      for (const p of plans) {
        const chip = document.createElement("span");
        chip.className = "plan-chip";
        const sw = document.createElement("i");
        sw.className = "sw";
        sw.style.background = planHue(p.id);
        chip.appendChild(sw);
        chip.appendChild(document.createTextNode(`${UI_TEXT.legendPlan}·${p.title}`));
        wrap.appendChild(chip);
      }
      legend.appendChild(wrap);
    }
    return legend;
  }
}
