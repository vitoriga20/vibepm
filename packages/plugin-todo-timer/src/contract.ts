/**
 * todoTimer 服务对外契约（单一配置源）：
 *  - 服务名 / postMessage 消息类型 / HTTP 路径 / localStorage 键，全部常量化在此，
 *    node 半、壳侧桥、消费插件（plugin-calendar）一律 import 引用，禁止他处写字面量。
 *  - preview 页（env.js）是复制式纯 JS 页面，无法 import 本文件：该处保留唯一一处
 *    字面量副本并注释指向这里（同 UI_TEXT 的既有做法）。
 *  - 数据结构沿用番茄钟 TaskList（client/preview/js/todoList.js 的 defaultTaskList），
 *    字段级兼容旧数据：statistics 旧记录无 title/planRef → 渲染端兜底，不报错。
 */

/** 内核服务名：ctx.provide(TODO_TIMER_SERVICE, svc) / 消费方 inject 它 */
export const TODO_TIMER_SERVICE = "todoTimer";

/** iframe → 父壳 postMessage 的消息类型（payload = 完整 TaskList 快照） */
export const SYNC_MSG_TYPE = "vibe.todo.sync";

/** 壳侧桥 → node 半的整包上报端点（POST，body = TaskList） */
export const SYNC_API_PATH = "/api/todo-timer/sync";

/** node 半快照/聚合查询端点（GET，调试与直连消费用；日历走自己的 /api/calendar/days） */
export const SNAPSHOT_API_PATH = "/api/todo-timer/snapshot";

/** 壳侧 client 事件（ClientContext.events）：上报成功后广播，消费面板自行刷新 */
export const SYNC_EVENT = "vibepm:todo-sync";

/** TaskList 在 localStorage 的存储键（env.js store 适配器内） */
export const TASKLIST_STORAGE_KEY = "todoList";

/** localStorage 键前缀（env.js store 适配器：前缀 + key） */
export const STORAGE_PREFIX = "todo-tomato:";

/** 壳侧 localStorage 全键名（boot 兜底直读用） */
export function taskListStorageFullKey(): string {
  return STORAGE_PREFIX + TASKLIST_STORAGE_KEY;
}

/** 毫秒 → 分钟（realDuration 以毫秒存储；与 env.js MS_PER_MINUTE 同值，TS 侧单一源） */
export const MS_PER_MINUTE = 60 * 1000;

// ———————————————————— TaskList 数据结构（字段级兼容旧数据） ————————————————————

/** 专注/休息统计条目（recordStatistics 写入；旧记录无 title/planRef 字段） */
export interface StatisticsEntry {
  /** 结束时间戳（聚合按它的本地日期归档） */
  endTimestamp: number;
  /** 番茄钟设定时长（毫秒） */
  duration: number;
  /** 实际有效时长（毫秒）= duration × progress，专注维度聚合口径 */
  realDuration: number;
  /** work | shortBreak | longBreak */
  type: string;
  /** 完成度 0-1 */
  progress: number;
  /** 关联任务 id（任务可能已删除 → 标题兜底） */
  tarId: number;
  /** 关联计划里程碑 id（如 "p1m2"；旧数据/未关联为 null） */
  planRef?: string | null;
  /** 关联任务标题（新增写入才有；旧记录缺失 → 按 tarId 反查或兜底） */
  title?: string | null;
}

/** 任务（current/done/archived 三列表元素；defaultTask 全量字段的运行时子集） */
export interface Task {
  id: number;
  title: string;
  type: string;
  state: string;
  createdTimestamp: number;
  modifiedTimestamp: number;
  doneTimestamp: number;
  milestoneId: string | null;
  tomato?: Record<string, number[]>;
  important?: boolean;
  urgent?: boolean;
  /** 计划日期（本地日期键 "YYYY-MM-DD"；未指定为 null/缺省，旧数据天然兼容） */
  dueDate?: string | null;
  [k: string]: unknown;
}

/** 里程碑（id 形如 "p1m2"，任务经 milestoneId 单向引用） */
export interface Milestone {
  id: string;
  title: string;
  createdTimestamp: number;
  doneTimestamp: number;
}

/** 计划（长期目标） */
export interface Plan {
  id: number;
  title: string;
  state: "active" | "done" | string;
  createdTimestamp: number;
  doneTimestamp: number;
  nextMilestoneId: number;
  milestones: Milestone[];
}

/** TaskList 完整快照（todoListManger.defaultTaskList 的运行时形状） */
export interface TaskList {
  archived: Task[];
  done: Task[];
  current: Task[];
  currentId: number;
  statistics: StatisticsEntry[];
  plans: Plan[];
  currentPlanId: number;
  [k: string]: unknown;
}

// ———————————————————— 聚合结果（getDistribution 返回） ————————————————————

/** 单日聚合 */
export interface DayAgg {
  /** 专注有效时长合计（毫秒，type=work 的 realDuration） */
  focusMs: number;
  /** 专注条数（≈番茄数，type=work） */
  focusCount: number;
  /** 当日完成任务数（done/archived 的 doneTimestamp 命中本地日期） */
  doneCount: number;
  /** 当日完成任务标题（渲染 tooltip 用） */
  doneTitles: string[];
  /** 长目标投入：里程碑 id → 当日专注毫秒 */
  planMs: Record<string, number>;
  /** 当日计划任务（dueDate 命中本地日期；三表合查，done = 已完成/已归档） */
  planned: Array<{ title: string; done: boolean }>;
}

/** 面向表现的计划元信息（图例/tooltip 需要标题；色相由渲染端按 id 派生） */
export interface PlanInfo {
  id: number;
  title: string;
  state: string;
  milestones: Array<{ id: string; title: string }>;
}

/** 日分布（日历面板消费的最终形状） */
export interface Distribution {
  /** 最后一次上报时间戳；null = 尚无任何上报（面板给引导提示） */
  updatedAt: number | null;
  /** 本地日期键 "YYYY-MM-DD" → 当日聚合 */
  days: Record<string, DayAgg>;
  /** 计划元信息（按 id 升序） */
  plans: PlanInfo[];
  /** 聚合计算时刻的本地日期键 */
  todayKey: string;
}

/** 任务维度统计单项（getTaskStats 的值；日历"点开某天看任务明细"的数据源） */
export interface TaskStat {
  /** 任务 id（= statistics 条目的 tarId） */
  tarId: number;
  /** 展示标题（title 冗余 → tarId 反查 → 兜底，同 StatisticsView 口径） */
  title: string;
  /** 累计专注番茄数（type=work 条数） */
  focusCount: number;
  /** 累计专注有效时长（毫秒，realDuration 合计） */
  focusMs: number;
  /** 最近一次专注结束时间戳（无专注 = 0） */
  lastFocusAt: number;
  /** 按天番茄数：本地日期键 → 当日专注条数 */
  focusOnDay: Record<string, number>;
}

/** 任务维度统计：tarId → TaskStat */
export type TaskStatsMap = Record<number, TaskStat>;

/** 统计条目的表现层展开（含解析后的任务/里程碑标题，缺失兜底） */
export interface StatisticsView extends StatisticsEntry {
  /** 展示用任务标题（title 缺失 → tarId 反查 → 兜底文案） */
  taskTitle: string;
  /** 本地日期键 */
  dateKey: string;
}

/** 兜底文案（渲染端引用，避免各处写死） */
export const UNKNOWN_TASK_LABEL = "（未知任务）";

/**
 * 本地日期键 "YYYY-MM-DD"：全链路聚合唯一口径。
 * 注意不得用 toISOString()（那是 UTC——跨天错位根源）。
 */
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** TaskList 的最小合法性校验（壳侧桥/node 半 ingest 共用；防误投/脏数据） */
export function isTaskListLike(v: unknown): v is TaskList {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return Array.isArray(t.statistics) && Array.isArray(t.current)
    && Array.isArray(t.done) && Array.isArray(t.archived);
}
