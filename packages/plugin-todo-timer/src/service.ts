/**
 * TodoTimerService：番茄钟数据在内核（node 半）的服务化形态。
 *  - 数据源：壳侧桥上报的 TaskList 整包快照（iframe localStorage 的镜像），整体替换、末次为准
 *  - 聚合口径：全部按 localDateKey 本地日期归档（跨天不错位）；
 *    旧数据兼容：statistics 无 title/planRef、任务已删除 → 兜底文案，不抛错
 *  - 消费方（plugin-calendar 等）inject 'todoTimer' 后只读本服务，不感知 iframe/存储细节
 */
import {
  type TaskList, type Task, type Distribution, type DayAgg, type PlanInfo,
  type StatisticsEntry, type StatisticsView, type TaskStatsMap,
  localDateKey, UNKNOWN_TASK_LABEL,
} from "./contract.js";

export class TodoTimerService {
  name = "todoTimer";
  private _snapshot: TaskList | null = null;
  private _updatedAt: number | null = null;

  /** 上报入口：整包替换（isTaskListLike 校验由调用方完成） */
  ingest(tl: TaskList): void {
    // 浅规范：老快照可能缺 plans 等字段（浅合并默认值，同 todoListManger.getTaskList 的兼容策略）
    const fallbacks: Partial<TaskList> = { plans: [], currentPlanId: 1 };
    const merged = { ...fallbacks, ...tl } as TaskList;
    if (!Array.isArray(merged.plans)) merged.plans = [];
    this._snapshot = merged;
    this._updatedAt = Date.now();
  }

  /** 原始快照（null = 本进程尚无上报） */
  getSnapshot(): TaskList | null {
    return this._snapshot;
  }

  /** 最后一次上报时间 */
  get updatedAt(): number | null {
    return this._updatedAt;
  }

  /** statistics 原始数组（空安全） */
  getStatistics(): StatisticsEntry[] {
    return this._snapshot?.statistics ?? [];
  }

  /** 任务反查表：id → task（current/done/archived 三表合一；删除的任务查不到 → 兜底） */
  private _taskIndex(): Map<number, Task> {
    const m = new Map<number, Task>();
    const s = this._snapshot;
    if (!s) return m;
    for (const t of [...s.current, ...s.done, ...s.archived]) m.set(t.id, t);
    return m;
  }

  /** 统计条目的表现层展开：解析任务标题（title → tarId 反查 → 兜底）+ 本地日期键 */
  getStatisticsViews(): StatisticsView[] {
    const idx = this._taskIndex();
    return this.getStatistics().map((e) => ({
      ...e,
      dateKey: localDateKey(e.endTimestamp),
      taskTitle: e.title
        || (idx.get(e.tarId)?.title ?? "")
        || UNKNOWN_TASK_LABEL,
    }));
  }

  /**
   * 任务维度聚合（任务列表🍅徽标 / 日历"点开某天看明细"的数据源）：
   *  - 只计 type === "work" 的专注条目，休息不计
   *  - 标题解析复用 getStatisticsViews 口径（title 冗余 → 反查 → 兜底），已删任务不丢
   */
  getTaskStats(): TaskStatsMap {
    const map: TaskStatsMap = {};
    for (const v of this.getStatisticsViews()) {
      if (v.type !== "work") continue;
      const s = map[v.tarId] ?? {
        tarId: v.tarId,
        title: v.taskTitle,
        focusCount: 0,
        focusMs: 0,
        lastFocusAt: 0,
        focusOnDay: {},
      };
      s.focusCount += 1;
      s.focusMs += Number.isFinite(v.realDuration) ? v.realDuration : 0;
      if (v.endTimestamp > s.lastFocusAt) s.lastFocusAt = v.endTimestamp;
      s.focusOnDay[v.dateKey] = (s.focusOnDay[v.dateKey] ?? 0) + 1;
      map[v.tarId] = s;
    }
    return map;
  }

  /**
   * 日分布聚合（日历面板的数据源）：
   *  - 专注维度：type === "work" 的条数与 realDuration 合计
   *  - 任务完成：done+archived 的 doneTimestamp 命中本地日期
   *  - 长目标投入：work 条目按 planRef（里程碑 id）累计
   */
  getDistribution(): Distribution {
    const days: Record<string, DayAgg> = {};
    const day = (key: string): DayAgg => {
      let d = days[key];
      if (!d) d = days[key] = { focusMs: 0, focusCount: 0, doneCount: 0, doneTitles: [], planMs: {}, planned: [] };
      return d;
    };

    for (const v of this.getStatisticsViews()) {
      if (v.type !== "work") continue;
      const d = day(v.dateKey);
      const ms = Number.isFinite(v.realDuration) ? v.realDuration : 0;
      d.focusMs += ms;
      d.focusCount += 1;
      if (v.planRef) d.planMs[v.planRef] = (d.planMs[v.planRef] ?? 0) + ms;
    }

    const s = this._snapshot;
    if (s) {
      // 计划任务：dueDate 命中当天（current 未做 / done+archived 已做，同一投影口径）
      for (const t of s.current) {
        if (t.dueDate) day(t.dueDate).planned.push({ title: t.title || UNKNOWN_TASK_LABEL, done: false });
      }
      for (const t of [...s.done, ...s.archived]) {
        if (t.dueDate) day(t.dueDate).planned.push({ title: t.title || UNKNOWN_TASK_LABEL, done: true });
        if (!t.doneTimestamp) continue;
        const d = day(localDateKey(t.doneTimestamp));
        d.doneCount += 1;
        d.doneTitles.push(t.title || UNKNOWN_TASK_LABEL);
      }
    }

    const plans: PlanInfo[] = (s?.plans ?? [])
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((p) => ({
        id: p.id,
        title: p.title,
        state: p.state,
        milestones: (p.milestones ?? []).map((m) => ({ id: m.id, title: m.title })),
      }));

    return { updatedAt: this._updatedAt, days, plans, todayKey: localDateKey(Date.now()) };
  }
}
