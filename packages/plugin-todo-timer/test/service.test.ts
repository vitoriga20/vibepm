// TodoTimerService 聚合逻辑单测：本地日期口径 / 旧数据兜底 / 删任务兜底 / 长目标累计
import { test } from "node:test";
import assert from "node:assert/strict";
import { TodoTimerService } from "../src/service.js";
import { localDateKey, UNKNOWN_TASK_LABEL, type TaskList, type Task } from "../src/contract.js";

/** 本地某天的指定时刻时间戳（偏移分钟可跨天：-1 = 前一天 23:59） */
function localTs(dayOffset: number, h: number, m: number): number {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function task(partial: Partial<Task> & { id: number }): Task {
  return {
    title: "", type: "short", state: "待办",
    createdTimestamp: 0, modifiedTimestamp: 0, doneTimestamp: 0,
    milestoneId: null, ...partial,
  } as Task;
}

function baseList(over: Partial<TaskList> = {}): TaskList {
  return {
    archived: [], done: [], current: [], currentId: 1,
    statistics: [], plans: [], currentPlanId: 1, ...over,
  } as TaskList;
}

test("ingest 快照整体替换 + updatedAt 记录", () => {
  const svc = new TodoTimerService();
  assert.equal(svc.getSnapshot(), null);
  assert.equal(svc.updatedAt, null);
  svc.ingest(baseList());
  assert.ok(svc.getSnapshot());
  assert.ok(svc.updatedAt! > 0);
  const second = baseList({ currentId: 9 });
  svc.ingest(second);
  assert.equal(svc.getSnapshot()!.currentId, 9);
});

test("旧快照缺 plans 字段 → 默认空数组不抛错", () => {
  const svc = new TodoTimerService();
  svc.ingest({ archived: [], done: [], current: [], currentId: 1, statistics: [] } as unknown as TaskList);
  const dist = svc.getDistribution();
  assert.deepEqual(dist.plans, []);
});

test("专注聚合：只计 work，realDuration 合计", () => {
  const svc = new TodoTimerService();
  const t0 = localTs(0, 10, 0);
  svc.ingest(baseList({
    statistics: [
      { endTimestamp: t0, duration: 30 * 60000, realDuration: 30 * 60000, type: "work", progress: 1, tarId: 1 },
      { endTimestamp: t0 + 60000, duration: 30 * 60000, realDuration: 15 * 60000, type: "work", progress: 0.5, tarId: 1 },
      { endTimestamp: t0 + 120000, duration: 5 * 60000, realDuration: 5 * 60000, type: "shortBreak", progress: 1, tarId: 1 },
    ],
  }));
  const day = svc.getDistribution().days[localDateKey(t0)];
  assert.equal(day.focusCount, 2);
  assert.equal(day.focusMs, 45 * 60000);
});

test("本地日期口径：本地零点后 1 分钟与前一天 23:59 落在不同本地日（不受 UTC 影响）", () => {
  const svc = new TodoTimerService();
  const justAfterMidnight = localTs(0, 0, 1);
  const justBeforeMidnight = localTs(-1, 23, 59);
  svc.ingest(baseList({
    statistics: [
      { endTimestamp: justAfterMidnight, duration: 60000, realDuration: 60000, type: "work", progress: 1, tarId: 1 },
      { endTimestamp: justBeforeMidnight, duration: 60000, realDuration: 60000, type: "work", progress: 1, tarId: 1 },
    ],
  }));
  const dist = svc.getDistribution();
  assert.ok(dist.days[localDateKey(justAfterMidnight)], "本地零点后应落在今天");
  assert.ok(dist.days[localDateKey(justBeforeMidnight)], "本地 23:59 应落在昨天");
  assert.notEqual(localDateKey(justAfterMidnight), localDateKey(justBeforeMidnight));
  // 同一天的「专注」与「任务完成」必须同格：done 也按本地日期归档
  svc.ingest(baseList({
    statistics: [
      { endTimestamp: justAfterMidnight, duration: 60000, realDuration: 60000, type: "work", progress: 1, tarId: 1 },
    ],
    done: [task({ id: 1, title: "晨间任务", doneTimestamp: justAfterMidnight + 3600000 })],
  }));
  const same = svc.getDistribution().days[localDateKey(justAfterMidnight)];
  assert.equal(same.focusCount, 1);
  assert.equal(same.doneCount, 1);
  assert.deepEqual(same.doneTitles, ["晨间任务"]);
});

test("任务完成聚合：done/archived 双表命中，无 doneTimestamp 不计", () => {
  const svc = new TodoTimerService();
  const ts = localTs(0, 18, 0);
  svc.ingest(baseList({
    done: [
      task({ id: 1, title: "写周报", doneTimestamp: ts }),
      task({ id: 2, title: "复盘", doneTimestamp: ts }),
    ],
    archived: [task({ id: 3, title: "上周归档", doneTimestamp: ts })],
    current: [task({ id: 4, title: "进行中不做数", doneTimestamp: 0 })],
  }));
  const day = svc.getDistribution().days[localDateKey(ts)];
  assert.equal(day.doneCount, 3);
  assert.deepEqual(day.doneTitles, ["写周报", "复盘", "上周归档"]);
});

test("长目标投入：work 条目按 planRef 累计，休息不计", () => {
  const svc = new TodoTimerService();
  const ts = localTs(0, 15, 0);
  svc.ingest(baseList({
    statistics: [
      { endTimestamp: ts, duration: 60000, realDuration: 60000, type: "work", progress: 1, tarId: 1, planRef: "p1m1" },
      { endTimestamp: ts + 1000, duration: 60000, realDuration: 30000, type: "work", progress: 0.5, tarId: 2, planRef: "p1m1" },
      { endTimestamp: ts + 2000, duration: 60000, realDuration: 60000, type: "work", progress: 1, tarId: 3, planRef: "p2m1" },
      { endTimestamp: ts + 3000, duration: 60000, realDuration: 60000, type: "longBreak", progress: 1, tarId: 1, planRef: "p1m1" },
    ],
    plans: [{
      id: 1, title: "学好英语", state: "active", createdTimestamp: 0, doneTimestamp: 0, nextMilestoneId: 2,
      milestones: [{ id: "p1m1", title: "背完词书", createdTimestamp: 0, doneTimestamp: 0 }],
    }, {
      id: 2, title: "健身计划", state: "active", createdTimestamp: 0, doneTimestamp: 0, nextMilestoneId: 1,
      milestones: [],
    }],
  }));
  const dist = svc.getDistribution();
  const day = dist.days[localDateKey(ts)];
  assert.equal(day.planMs["p1m1"], 90000);
  assert.equal(day.planMs["p2m1"], 60000);
  // 计划元信息按 id 升序，里程碑带标题（图例/tooltip 用）
  assert.deepEqual(dist.plans.map((p) => p.title), ["学好英语", "健身计划"]);
  assert.equal(dist.plans[0].milestones[0].title, "背完词书");
});

test("标题解析链：新记录 title → 旧记录 tarId 反查 → 已删任务兜底", () => {
  const svc = new TodoTimerService();
  const ts = localTs(0, 9, 0);
  svc.ingest(baseList({
    current: [task({ id: 7, title: "在做的任务" })],
    statistics: [
      // 新写入：自带 title（任务删除后仍可显示）
      { endTimestamp: ts, duration: 60000, realDuration: 60000, type: "work", progress: 1, tarId: 999, title: "已被删除的任务" },
      // 旧记录：无 title，靠 tarId 反查
      { endTimestamp: ts + 1000, duration: 60000, realDuration: 60000, type: "work", progress: 1, tarId: 7 },
      // 老数据：无 title 且任务已删 → 兜底文案，不抛错
      { endTimestamp: ts + 2000, duration: 60000, realDuration: 60000, type: "work", progress: 1, tarId: 12345 },
    ],
  }));
  const views = svc.getStatisticsViews();
  assert.equal(views[0].taskTitle, "已被删除的任务");
  assert.equal(views[1].taskTitle, "在做的任务");
  assert.equal(views[2].taskTitle, UNKNOWN_TASK_LABEL);
});

test("remove 后旧活动仍在日历可见（statistics 不随任务删除消失）", () => {
  const svc = new TodoTimerService();
  const ts = localTs(-2, 20, 0);
  // 任务已从所有列表删除（remove 只清 current），但统计条目保留
  svc.ingest(baseList({
    statistics: [
      { endTimestamp: ts, duration: 60000, realDuration: 60000, type: "work", progress: 1, tarId: 42, title: "已完成专注" },
    ],
  }));
  const day = svc.getDistribution().days[localDateKey(ts)];
  assert.ok(day, "删除任务的旧活动仍在");
  assert.equal(day.focusCount, 1);
  assert.equal(svc.getStatisticsViews()[0].taskTitle, "已完成专注");
});

test("任务维度聚合：番茄数/时长/最近专注按 tarId 累计，休息不计", () => {
  const svc = new TodoTimerService();
  const day1 = localTs(-1, 10, 0);
  const day2 = localTs(0, 15, 0);
  svc.ingest(baseList({
    current: [task({ id: 7, title: "写文档" })],
    statistics: [
      { endTimestamp: day1, duration: 30 * 60000, realDuration: 30 * 60000, type: "work", progress: 1, tarId: 7 },
      { endTimestamp: day1 + 60000, duration: 30 * 60000, realDuration: 15 * 60000, type: "work", progress: 0.5, tarId: 7 },
      { endTimestamp: day2, duration: 25 * 60000, realDuration: 25 * 60000, type: "work", progress: 1, tarId: 7 },
      // 休息挂在同一任务下，不应计入
      { endTimestamp: day2 + 60000, duration: 5 * 60000, realDuration: 5 * 60000, type: "shortBreak", progress: 1, tarId: 7 },
      // 另一任务一条
      { endTimestamp: day2 + 120000, duration: 60000, realDuration: 60000, type: "work", progress: 1, tarId: 8, title: "读论文" },
    ],
  }));
  const stats = svc.getTaskStats();
  assert.equal(Object.keys(stats).length, 2);
  const doc = stats[7];
  assert.equal(doc.title, "写文档");
  assert.equal(doc.focusCount, 3);
  assert.equal(doc.focusMs, 70 * 60000);
  assert.equal(doc.lastFocusAt, day2);
  // 按天分布：昨天 2 颗、今天 1 颗（本地日期键口径）；时长按天同步累计
  assert.equal(doc.focusOnDay[localDateKey(day1)], 2);
  assert.equal(doc.focusOnDay[localDateKey(day2)], 1);
  assert.equal(doc.focusMsOnDay[localDateKey(day1)], 45 * 60000);
  assert.equal(doc.focusMsOnDay[localDateKey(day2)], 25 * 60000);
  // title 冗余优先于反查（任务 8 不在列表里也不丢标题）
  assert.equal(stats[8].title, "读论文");
});

test("任务维度聚合：无快照/无专注 → 空表", () => {
  const svc = new TodoTimerService();
  assert.deepEqual(svc.getTaskStats(), {});
  svc.ingest(baseList({
    statistics: [{ endTimestamp: localTs(0, 9, 0), duration: 60000, realDuration: 60000, type: "longBreak", progress: 1, tarId: 1 }],
  }));
  assert.deepEqual(svc.getTaskStats(), {});
});

test("计划任务聚合：dueDate 命中当天，current 未做 / done+archived 已做", () => {
  const svc = new TodoTimerService();
  const today = localDateKey(Date.now());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = localDateKey(tomorrowDate.getTime());
  svc.ingest(baseList({
    current: [
      task({ id: 1, title: "今天要做的", dueDate: today }),
      task({ id: 2, title: "明天再做", dueDate: tomorrow }),
      task({ id: 3, title: "没排期的不算" }), // 无 dueDate
    ],
    done: [task({ id: 4, title: "排了今天且已完成", dueDate: today, doneTimestamp: localTs(0, 11, 0) })],
    archived: [task({ id: 5, title: "上周排期已归档", dueDate: "2020-01-01" })],
  }));
  const dist = svc.getDistribution();
  assert.deepEqual(dist.days[today].planned, [
    { title: "今天要做的", done: false },
    { title: "排了今天且已完成", done: true },
  ]);
  assert.deepEqual(dist.days[tomorrow].planned, [{ title: "明天再做", done: false }]);
  assert.deepEqual(dist.days["2020-01-01"].planned, [{ title: "上周排期已归档", done: true }]);
  // 无 dueDate 的任务不产生任何 planned 日
  assert.equal(dist.days[today].planned.length, 2);
});

test("计划任务聚合：空标题兜底，旧数据无 dueDate 不抛错", () => {
  const svc = new TodoTimerService();
  const key = localDateKey(Date.now());
  svc.ingest(baseList({
    current: [task({ id: 1, title: "", dueDate: key }), { id: 2 } as Task], // 裸旧任务对象
  }));
  const dist = svc.getDistribution();
  assert.deepEqual(dist.days[key].planned, [{ title: UNKNOWN_TASK_LABEL, done: false }]);
});
