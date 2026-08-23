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
