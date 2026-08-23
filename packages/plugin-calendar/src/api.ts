/**
 * plugin-calendar 自有契约（node 半路由 ↔ client 半面板 共用，单一源）：
 * client bundle 经相对路径 import 本文件（esbuild 内联；不得裸引用 @vitoriga20/*，浏览器无法解析）。
 */

/** 日历数据端点：GET → { ok, updatedAt, days, plans, todayKey }（todoTimer 服务的聚合投影） */
export const CALENDAR_API_PATH = "/api/calendar/days";

/** 毫秒 → 分钟换算（与 todoTimer 契约 MS_PER_MINUTE 同值：物理常量，表现层换算用） */
export const MS_PER_MINUTE = 60 * 1000;
