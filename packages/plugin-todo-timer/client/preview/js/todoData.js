/**
 * todoData.js · todoList 数据层单一源（index.html 与 capsule.html 共用）
 *  - 纯函数集合：直接操作 store 里的 "todoList" 快照（env.js store 已带 todo-tomato: 前缀）
 *  - todoList.js 的 todoListManger 方法委托到这里（保持对外 API 不变）；
 *    桌面胶囊页（capsule.js）不经 manager 直接调用，消除复制式副本
 *  - 依赖：env.js（store / MS_PER_MINUTE）需先于本文件加载
 */

/** 任务累计番茄总数（task.tomato = { progress: [timestamps] }；数据复盘唯一口径） */
function countTaskTomato(task) {
  if (!task || !task.tomato) return 0;
  return Object.values(task.tomato).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
}

/** 读取 todoList 快照 */
function getTodoList() {
  return store.getItem("todoList");
}

/** 保存 todoList 快照 */
function saveTodoList(list) {
  store.setItem("todoList", list);
}

/** 跨列表查找任务（current / done / archived） */
function findTaskInList(list, id) {
  if (!list || id == null || id === -1) return null;
  return (
    list.current.find((t) => t.id === id) ||
    list.done.find((t) => t.id === id) ||
    list.archived.find((t) => t.id === id) ||
    null
  );
}

/**
 * 「在做」= 用户显式设定的 active 标志（无设定不算任何任务在做——
 * 避免隐式 current[0] 导致按天过滤漏未来待办、专注隐式绑错任务）
 */
function getActiveTaskOf(list) {
  if (!list) return { id: -1, title: "", tomato: {}, milestoneId: null };
  const explicit = list.current.find((t) => t.active === true);
  return explicit || list.defaultTask || { id: -1, title: "", tomato: {}, milestoneId: null };
}

/**
 * 记一条统计（title 冗余进记录：日历等消费端在任务被删后仍能显示专注对象）
 */
function recordStatisticsToList(list, duration, type, progress, task) {
  if (!list) return;
  const t = task || getActiveTaskOf(list);
  list.statistics.push({
    endTimestamp: Date.now(),
    duration,
    realDuration: duration * progress,
    type,
    progress,
    tarId: t.id,
    planRef: t.milestoneId || null, // 长期归属：关联的计划里程碑 id
    title: t.title || "",
  });
  saveTodoList(list); // 统计必须持久化，否则刷新后首页「H」与「统计」的活动时间会丢失
}

/**
 * 番茄记账：只要专注过就落 statistics（时长无门槛）；番茄个数 ≥0.3 才算一个。
 * 绑定任务中途被删时挂到 defaultTask(tarId=-1)，不张冠李戴到其它任务。
 * @returns {{title,total,partial,counted}} counted=true 表示本次计入一个番茄
 */
function addTomatoToTaskInList(list, id, duration, progress) {
  if (!list) return { title: "", total: 0, partial: false, counted: false };
  const task = findTaskInList(list, id);
  recordStatisticsToList(list, duration, "work", progress, task || list.defaultTask);
  if (!task || task.id === -1) {
    return { title: "", total: 0, partial: false, counted: false };
  }
  if (progress >= 0.3) {
    if (!task.tomato) task.tomato = {}; // 老数据兜底
    if (!task.tomato[progress]) task.tomato[progress] = [];
    task.tomato[progress].push(Date.now());
    saveTodoList(list);
    return { title: task.title, total: countTaskTomato(task), partial: false, counted: true };
  }
  return { title: task.title, total: countTaskTomato(task), partial: true, counted: false };
}

/** 今日番茄数与专注分钟（红=跑满≥0.9，黄=其余；分钟按 realDuration 累计） */
function statisticsTodayNumOf(list) {
  if (!list) return { red: 0, yellow: 0, focusMinutes: 0 };
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  let red = 0, yellow = 0, totalFocusTime = 0;
  for (let i = list.statistics.length - 1; i >= 0; i--) {
    const item = list.statistics[i];
    if (item.endTimestamp < startOfDay.getTime()) break; // 统计按时间近远有序，早于今天即止
    if (item.type === "work") {
      if (item.progress >= 0.9) red++; else yellow++;
      totalFocusTime += item.realDuration || 0;
    }
  }
  return { red, yellow, focusMinutes: parseFloat((totalFocusTime / MS_PER_MINUTE).toFixed(1)) };
}

/** 完成「在做」任务（current → done）；无在做任务返回 false */
function completeActiveTaskInList(list) {
  if (!list) return false;
  const t = getActiveTaskOf(list);
  if (t.id === -1) return false;
  list.current = list.current.filter((x) => x.id !== t.id);
  t.doneTimestamp = Date.now();
  list.done.push(t);
  saveTodoList(list);
  return true;
}

/** 任务所属计划+里程碑（plans 结构：plan.milestones[].id === task.milestoneId；未归属返回 null） */
function milestoneChainOf(list, task) {
  if (!list || !task || !task.milestoneId) return null;
  for (const plan of list.plans || []) {
    const ms = (plan.milestones || []).find((m) => m.id === task.milestoneId);
    if (ms) return { planTitle: plan.title, milestoneTitle: ms.title };
  }
  return null;
}

/** 任务所属里程碑标题（胶囊 #标签用；plans 结构：plan.milestones[].id === task.milestoneId） */
function milestoneLabelOf(list, task) {
  const chain = milestoneChainOf(list, task);
  return chain ? chain.milestoneTitle : "";
}
