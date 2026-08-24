/**
 * 统计/查找类纯函数已抽到 todoData.js 单一源（countTaskTomato / findTaskInList /
 * getActiveTaskOf / recordStatisticsToList / addTomatoToTaskInList / statisticsTodayNumOf /
 * completeActiveTaskInList），本文件 manager 方法委托过去；桌面胶囊页直接用同一份。
 */

/**
 * 本地日期键 "YYYY-MM-DD"（dueDate 全链路唯一口径；语义同 node 半契约 contract.ts 的
 * localDateKey —— 本页无法 import TS 契约，保留字面量副本并注释指向）
 */
function previewLocalDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 多天排期归一化：dueDate 单字符串（旧数据）→ [key]；数组 → 去重升序；空/缺省/脏值 → []
 * 全链路读取唯一入口（徽标/按天可见/表单回填/服务端投影均只认它）
 */
function dueDatesOf(task) {
  const v = task && task.dueDate;
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return [...new Set(arr.filter((k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k)))].sort();
}

/**
 * 任务累计专注毫秒（statistics 里 type=work 且 tarId 命中的 realDuration 合计）
 * 数据复盘口径：任务卡时长徽标 / tooltip 全走这里
 */
function taskFocusMs(task) {
  if (!task) return 0;
  const list = todoManger_.TaskList.statistics || [];
  let ms = 0;
  for (const e of list) {
    if (e && e.type === "work" && e.tarId === task.id && Number.isFinite(e.realDuration)) ms += e.realDuration;
  }
  return ms;
}

/**
 * 计划日期徽标 HTML（多天排期：单天=今天/过期/常规着色 + M/D；多天=天数计数；
 * 过期判定：全部选中日期都过去才算过期；title 带日期列表原文与状态）
 */
function dueTagHtml(task) {
  const days = dueDatesOf(task);
  if (!days.length) return "";
  const todayKey = previewLocalDateKey(new Date());
  const hasToday = days.includes(todayKey);
  const hasFuture = days.some((k) => k > todayKey);
  const cls = hasToday ? "today" : (hasFuture ? "" : "overdue");
  let label;
  if (days.length === 1) {
    const dd = new Date(days[0] + "T00:00:00");
    label = cls === "today" ? UI_TEXT.dueToday : `${dd.getMonth() + 1}/${dd.getDate()}`;
  } else {
    label = UI_TEXT.dueDays(days.length);
  }
  const tip = cls === "overdue" ? UI_TEXT.dueTagTipOverdue(days) : UI_TEXT.dueTagTip(days);
  return `<div class="dueTag ${cls}" title="${tip}">${label}</div>`;
}

class todoListManger {
  constructor(type) {
    this.type = type;
    this.defaultTaskList = {
      archived: [],
      done: [],
      current: [],
      currentId: 0,
      statistics: [],
      // 计划（长期目标/里程碑）：任务长期归属的唯一通道
      plans: [],
      currentPlanId: 1,
      defaultTask: {
        id: -1,
        title: "",
        type: "long",
        state: "待办", //待办、进行中、完成、删除
        createdTimestamp: 0,
        modifiedTimestamp: 0,
        beginTimestamp: 0,
        endTimestamp: 0,
        doneTimestamp: 0,
        priority: 0,
        star: false,
        tomato: {},
        important: false, // 四象限·重要
        urgent: false, // 四象限·紧急
        milestoneId: null, // 关联的计划里程碑 id（如 "p1m2"；null=未关联）
      },
    }


    this.TaskList = null;
    this.getTaskList();

    this.onChange = () => { }; // 用于监听配置变化
    this.onActiveTaskChange = () => { }; // 用于监听当前任务变化
    this.onTomatoFinish = () => { }; // 用于监听番茄钟完成
    this.onUpdate = () => { }; // 用于监听更新
    this.onActiveTaskInfoChange = () => { }; // 用于监听当前任务信息变化
    this.onPlanChange = () => { }; // 用于监听计划（长期目标/里程碑）变化
    let lastActiveTask = this.getActiveTask();
  }

  /**
   * 获取配置
   */
  getTaskList() {
    let TaskList = store.getItem(this.type);
    if (!TaskList) {
      TaskList = this.defaultTaskList;
      this.saveTaskList(TaskList); // 只有在第一次初始化时保存默认配置
    } else {
      // 新旧数据兼容：顶层浅合并默认结构，老数据缺失的新字段（plans 等）自动补默认值
      this.TaskList = { ...this.defaultTaskList, ...TaskList };
    }
  }

  /**
   * 保存配置
   */
  saveTaskList(TaskList) {
    store.setItem(this.type, TaskList);
    this.TaskList = TaskList;
  }

  /**
   * 添加任务
   */
  add(todo) {
    let currentId = this.TaskList.currentId; // 创建一个临时变量存储 currentId 的值
    todo.id = currentId; // 使用临时变量的值赋给 todo.id
    todo.createdTimestamp = Date.now(); // 设置任务的创建时间戳
    todo.tomato = {}; // 初始化 tomato 属性

    // 使用 JSON.parse(JSON.stringify(todo)) 深拷贝 todo 对象
    this.TaskList.current.push(JSON.parse(JSON.stringify(todo)));

    this.TaskList.currentId++; // currentId 自增
    this.saveTaskList(this.TaskList);
    this.onTomatoFinish();
    this.onChange(); // 调用监听函数
  }

  /**
   * 删除任务
   */
  remove(id) {
    this.TaskList.current = this.TaskList.current.filter((todo) => todo.id !== id);

    this.saveTaskList(this.TaskList);
    this.onChange(); // 调用监听函数
  }

  /**
   * 完成任务
   */
  done(id) {
    if (id == -1) return;

    // console.log(task)
    const todo = this.TaskList.current.find((todo) => todo.id == id);
    this.TaskList.current = this.TaskList.current.filter((todo) => todo.id != id);
    todo.doneTimestamp = Date.now();
    this.TaskList.done.push(todo);
    this.saveTaskList(this.TaskList);
    this.onChange(); // 调用监听函数
  }

  /**
   * 将某任务移动到列表的指定位置
   */
  move(id, list, index) {
    const todo = this.TaskList[list].find((todo) => todo.id == id);
    this.TaskList[list] = this.TaskList[list].filter((todo) => todo.id != id);
    this.TaskList[list].splice(index, 0, todo);
    this.saveTaskList(this.TaskList);
    this.onChange(); // 调用监听函数
  }

  /**
   * 更新任务
   */
  update(id, title) {
    // 定位到要更新的任务，不论是在 current、done 还是 archived 列表中
    const todo = this.TaskList.current.find((todo) => todo.id === id) || this.TaskList.done.find((todo) => todo.id === id) || this.TaskList.archived.find((todo) => todo.id === id);
    // 更新任务的标题
    todo.title = title;
    // 记录修改时间
    todo.modifiedTimestamp = Date.now();
    // 保存更新后的任务列表
    this.saveTaskList(this.TaskList);

    this.onUpdate(id, title);

    if(id == this.getActiveTask().id){
      this.onActiveTaskInfoChange();
    }
  }

  /**
   * 激活任务
   */
  activeTask(id, listName) {
    // 检查指定的列表是否存在
    if (!this.TaskList[listName]) {
      throw new Error(`List ${listName} does not exist`);
    }
    // 在指定的列表中查找任务
    const todo = this.TaskList[listName].find((todo) => todo.id === id);
    // 如果任务不存在，抛出错误
    if (!todo) {
      throw new Error(`Task with id ${id} not found in list ${listName}`);
    }
    // 从指定的列表中移除任务
    this.TaskList[listName] = this.TaskList[listName].filter((todo) => todo.id !== id);
    // 记录修改时间
    todo.modifiedTimestamp = Date.now();

    // 将任务添加到 current 列表的第一个位置
    this.TaskList.current.unshift(todo);
    // 「在做」显式化：唯一 active 标志（旧数据无此字段=无在做；点卡片显式设定）
    for (const t of this.TaskList.current) t.active = t.id === id;
    // 保存更新后的任务列表
    this.saveTaskList(this.TaskList);
    // 调用监听函数
    this.onChange();
  }

  /**
   * 获取当前任务（「在做」= 用户点卡片显式设定的 active 标志；
   * 无设定时不算任何任务在做——避免隐式 current[0] 导致按天过滤漏未来待办、专注隐式绑错任务）
   */
  getActiveTask() {
    return getActiveTaskOf(this.TaskList);
  }

  /**
   * 监听当前任务变化
  */
  isActivedTaskChanged() {
    const currentActiveTask = this.getActiveTask();
    if (currentActiveTask !== this.lastActiveTask) {
      this.lastActiveTask = currentActiveTask;
      this.onActiveTaskChange(currentActiveTask);
    }
  }
  /**
   * 完成当前任务
   */
  compltedActiveTask() {
    const task = this.getActiveTask();
    if (task.id === -1) return false; // 无显式「在做」：无可完成对象
    this.done(task.id); // 走 done：saveTaskList + onChange 保持原渲染联动
    return true;
  }

  /**
   * 记录统计数据
   * @param {number} duration - 番茄钟持续时间(毫秒)
   * @param {string} type - 类型('work'|'shortBreak'|'longBreak')
   * @param {number} progress - 完成度(0-1)
   * @param {object} [task] - 关联任务（默认取当前在做任务；专注结束时应传绑定任务）
   */
  recordStatistics(duration, type, progress, task = null) {
    recordStatisticsToList(this.TaskList, duration, type, progress, task);
  }

  /**
   * 统计今天完成和未完成任务的数量
   */
  statisticsTodayNum() {
    return statisticsTodayNumOf(this.TaskList);
  }

  /**
   * 统计今天完成和未完成任务的数量
   */
  allTodayTomatos(days = 1) {
    // 获取今天的开始时间
    const now = new Date();
    let startOfPeriod = new Date();

    if (days === 1) {
      // 设置为今天的0点0分0秒
      startOfPeriod.setHours(0, 0, 0, 0);
    } else if (days === 7) {
      // 找到最近的周日
      const dayOfWeek = now.getDay(); // 0是周日
      startOfPeriod.setDate(now.getDate() - dayOfWeek);
      startOfPeriod.setHours(0, 0, 0, 0);
    } else if (days === 30) {
      // 设置为本月1号的0点0分0秒
      startOfPeriod.setDate(1);
      startOfPeriod.setHours(0, 0, 0, 0);
    } else {
      throw new Error("Invalid parameter. Only 1, 7, and 30 are allowed.");
    }

    // 统计指定时间段内的任务并计算progress出现的次数
    const progressCount = {};

    // 反向遍历任务列表
    for (let i = this.TaskList.statistics.length - 1; i >= 0; i--) {
      const item = this.TaskList.statistics[i];

      if (item.endTimestamp < startOfPeriod.getTime()) {
        // 一旦发现早于开始时间的数据就结束遍历
        break;
      }

      if (item.type === "work" && item.endTimestamp >= startOfPeriod.getTime()) {
        // 只统计type为'work'且在指定时间段内的任务
        if (progressCount[item.progress] !== undefined) {
          progressCount[item.progress]++;
        } else {
          progressCount[item.progress] = 1;
        }
      }
    }

    return progressCount;
  }



  /**
   * 统计所有任务的统计数据
   */
  getWorkStatistics() {
    const workItems = this.TaskList.statistics.filter((item) => item.type === "work");

    // 计算总天数（用 endTimestamp 统计，去重）
    const uniqueDays = new Set(workItems.map((item) => new Date(item.endTimestamp).toDateString()));

    // 计算总时间（用 realDuration 加和，单位为分钟，保留一位小数）
    const totalTime = workItems.reduce((sum, item) => sum + item.realDuration, 0) / MS_PER_MINUTE;
    const totalTimeMinutes = totalTime.toFixed(1);

    // 计算总项数
    const totalItems = workItems.length;

    return {
      totalDay: uniqueDays.size,
      totalMinute: parseFloat(totalTimeMinutes),
      totalTomato: totalItems,
      totalShortTar: this.TaskList.archived.length + this.TaskList.current.length + this.TaskList.done.length,
    };
  }

  /**
   * 统计 type=work 的所有项的日期和数量分布
   */
  getWorkDateDistribution() {
    const workItems = this.TaskList.statistics.filter((item) => item.type === "work");

    // 创建日期、数量和持续时间分布的对象
    const dateDistribution = {};

    workItems.forEach((item) => {
      const date = `${new Date(item.endTimestamp).toISOString().split("T")[0]}`;
      if (!dateDistribution[date]) {
        dateDistribution[date] = { count: 0, totalDuration: 0 };
      }
      dateDistribution[date].count++;
      dateDistribution[date].totalDuration += item.realDuration;
    });

    return dateDistribution;
  }

  /**
   * 添加番茄到指定任务（专注绑定记账：无论跑满或中断，只累计到绑定任务）
   * @param {number} id - 绑定任务 id（-1 表示未绑定，仅记统计）
   * @param {number} duration - 番茄钟预设时间(毫秒)
   * @param {number} progress - 完成度(0-1)
   * @returns {{title: string, total: number, partial: boolean}} 任务标题与累计番茄总数（未绑定时 title 为空）
   */
  addTomatoToTask(id, duration, progress) {
    const result = addTomatoToTaskInList(this.TaskList, id, duration, progress);
    if (result.counted) this.onChange(); // 计入一个番茄才触发重渲染（与原行为一致）
    return result;
  }

  /**
   * 跨列表查找任务（current / done / archived）
   */
  findTask(id) {
    return findTaskInList(this.TaskList, id);
  }

  // ———————————————————— 四象限 ————————————————————

  /**
   * 任务所属象限：0=Q1(重要+紧急) 1=Q2(重要) 2=Q3(紧急) 3=Q4(一般)
   */
  quadrantOf(task) {
    const imp = task.important === true;
    const urg = task.urgent === true;
    if (imp && urg) return 0;
    if (imp) return 1;
    if (urg) return 2;
    return 3;
  }

  /**
   * 标记/取消「重要」（实时重排由 onChange 渲染层保证）
   */
  toggleImportant(id) {
    const todo = this.TaskList.current.find((todo) => todo.id === id);
    if (!todo) return;
    todo.important = todo.important !== true;
    todo.modifiedTimestamp = Date.now();
    this.saveTaskList(this.TaskList);
    this.onChange();
  }

  /**
   * 标记/取消「紧急」
   */
  toggleUrgent(id) {
    const todo = this.TaskList.current.find((todo) => todo.id === id);
    if (!todo) return;
    todo.urgent = todo.urgent !== true;
    todo.modifiedTimestamp = Date.now();
    this.saveTaskList(this.TaskList);
    this.onChange();
  }

  /**
   * 设置/清除「计划日期」（dateKeys = 本地日期键数组，多天排期；null/空数组 = 清除）
   * 只改字段不动列表：done/archived 的任务也可排期（跨表 findTask）
   */
  setDueDate(id, dateKeys) {
    this.updateTaskMeta(id, { dueDate: dateKeys && dateKeys.length ? [...dateKeys] : null });
  }

  /**
   * 编辑待办元信息（名称/描述/日期；计划页编辑表单与任务卡改期共用入口）
   * 传了的字段才改：title 空串忽略；desc/dueDate 传 null 即清除
   */
  updateTaskMeta(id, meta) {
    const todo = this.findTask(id);
    if (!todo) return;
    if (meta.title !== undefined && String(meta.title).trim()) todo.title = String(meta.title).trim();
    if (meta.desc !== undefined) todo.desc = meta.desc || "";
    if (meta.dueDate !== undefined) {
      // 统一存为去重升序数组（或 null）；读侧 dueDatesOf 对旧单字符串同样兼容
      todo.dueDate = Array.isArray(meta.dueDate) && meta.dueDate.length ? [...new Set(meta.dueDate)].sort() : null;
    }
    todo.modifiedTimestamp = Date.now();
    this.saveTaskList(this.TaskList);
    this.onChange();
    this.onPlanChange();
  }

  /**
   * 当天可见待办（主列表「按天」视图）：
   *  - 无 dueDate（随时可做）∪ 首个排期日已到（多天排期自最早那天起持续可见，
   *    到期/逾期任务留在列表由 dueTag 着色提醒；未来排期未到不混入）
   *  - 「在做」任务无条件可见（正在专注的对象不能从列表凭空消失）
   */
  visibleTodayTasks() {
    const todayKey = previewLocalDateKey(new Date());
    const activeId = this.getActiveTask().id;
    return this.TaskList.current.filter((t) => {
      if (t.id === activeId) return true;
      const days = dueDatesOf(t);
      return !days.length || days[0] <= todayKey;
    });
  }

  /**
   * 待办列表渲染顺序：象限优先（Q1→Q4），同象限内按创建时间新到旧
   * （只算视图顺序，不改存储数组；「在做」仍由 current[0] 承载）
   */
  sortedCurrentTasks() {
    return this.visibleTodayTasks().sort((a, b) => {
      const qa = this.quadrantOf(a);
      const qb = this.quadrantOf(b);
      if (qa !== qb) return qa - qb;
      return (b.createdTimestamp || 0) - (a.createdTimestamp || 0);
    });
  }

  /**
   * 四象限汇总：各象限任务数与番茄投入
   * 待办侧取「当天可见集」（与主列表口径一致，未来排期不混入）；已完成/归档保持全量复盘视角
   */
  getQuadrantSummary() {
    const all = [...this.visibleTodayTasks(), ...this.TaskList.done, ...this.TaskList.archived];
    const summary = [0, 1, 2, 3].map((q) => ({ quadrant: q, taskCount: 0, tomatoCount: 0 }));
    all.forEach((t) => {
      const q = this.quadrantOf(t);
      summary[q].taskCount++;
      summary[q].tomatoCount += countTaskTomato(t);
    });
    return summary;
  }

  // ———————————————————— 计划（长期目标/里程碑） ————————————————————

  /**
   * 添加计划
   */
  addPlan(title) {
    const plan = {
      id: this.TaskList.currentPlanId++,
      title,
      state: "active", // active=进行中 done=已归档
      createdTimestamp: Date.now(),
      doneTimestamp: 0,
      nextMilestoneId: 1,
      milestones: [], // {id, title, createdTimestamp, doneTimestamp}
    };
    this.TaskList.plans.push(plan);
    this.saveTaskList(this.TaskList);
    this.onPlanChange();
  }

  /**
   * 更新计划标题
   */
  updatePlanTitle(id, title) {
    const plan = this.TaskList.plans.find((p) => p.id === id);
    if (!plan) return;
    plan.title = title;
    this.saveTaskList(this.TaskList);
    this.onPlanChange();
  }

  /**
   * 完成计划（归档，可回看）
   */
  completePlan(id) {
    const plan = this.TaskList.plans.find((p) => p.id === id);
    if (!plan) return;
    plan.state = "done";
    plan.doneTimestamp = Date.now();
    this.saveTaskList(this.TaskList);
    this.onPlanChange();
  }

  /**
   * 恢复计划（从归档回到进行中）
   */
  resumePlan(id) {
    const plan = this.TaskList.plans.find((p) => p.id === id);
    if (!plan) return;
    plan.state = "active";
    plan.doneTimestamp = 0;
    this.saveTaskList(this.TaskList);
    this.onPlanChange();
  }

  /**
   * 添加里程碑（id 形如 p1m2，全局唯一，供任务 milestoneId 单向引用）
   */
  addMilestone(planId, title) {
    const plan = this.TaskList.plans.find((p) => p.id === planId);
    if (!plan) return;
    plan.milestones.push({
      id: `p${planId}m${plan.nextMilestoneId++}`,
      title,
      createdTimestamp: Date.now(),
      doneTimestamp: 0,
    });
    this.saveTaskList(this.TaskList);
    this.onPlanChange();
  }

  /**
   * 更新里程碑标题
   */
  updateMilestoneTitle(planId, milestoneId, title) {
    const plan = this.TaskList.plans.find((p) => p.id === planId);
    if (!plan) return;
    const ms = plan.milestones.find((m) => m.id === milestoneId);
    if (!ms) return;
    ms.title = title;
    this.saveTaskList(this.TaskList);
    this.onPlanChange();
  }

  /**
   * 切换里程碑达成状态（达成=打勾划线；再点取消达成）
   */
  toggleMilestone(planId, milestoneId) {
    const plan = this.TaskList.plans.find((p) => p.id === planId);
    if (!plan) return;
    const ms = plan.milestones.find((m) => m.id === milestoneId);
    if (!ms) return;
    ms.doneTimestamp = ms.doneTimestamp ? 0 : Date.now();
    this.saveTaskList(this.TaskList);
    this.onPlanChange();
  }

  /**
   * 关联/解除任务到里程碑（单一源：任务.milestoneId；里程碑关联列表由反查得到）
   * @param {number} taskId
   * @param {string|null} milestoneId - null 解除关联
   */
  assignTaskToMilestone(taskId, milestoneId) {
    const task = this.findTask(taskId);
    if (!task) return;
    task.milestoneId = milestoneId;
    task.modifiedTimestamp = Date.now();
    this.saveTaskList(this.TaskList);
    this.onPlanChange();
    this.onChange(); // 任务卡上的里程碑标签同步刷新
  }

  /**
   * 反查某里程碑挂的所有任务（含待办/已完成/已归档）
   */
  tasksOfMilestone(milestoneId) {
    return [...this.TaskList.current, ...this.TaskList.done, ...this.TaskList.archived].filter((t) => t.milestoneId === milestoneId);
  }

  /**
   * 查找里程碑及其所属计划
   */
  findMilestone(milestoneId) {
    if (!milestoneId) return null;
    for (const plan of this.TaskList.plans) {
      const ms = plan.milestones.find((m) => m.id === milestoneId);
      if (ms) return { plan, milestone: ms };
    }
    return null;
  }

  /**
   * 计划番茄总投入（计划下所有里程碑关联任务的番茄累计）
   */
  planTomatoTotal(plan) {
    return plan.milestones.reduce((sum, ms) => sum + this.tasksOfMilestone(ms.id).reduce((s, t) => s + countTaskTomato(t), 0), 0);
  }

  /**
   * 归档方法
   */
  archiveTasks() {
    const today = new Date();
    const todayTimestamp = today.setHours(0, 0, 0, 0); // 获取当天的零点时间戳
    const tasksToArchive = this.TaskList.done.filter((task) => task.doneTimestamp < todayTimestamp);
    this.TaskList.done = this.TaskList.done.filter((task) => task.doneTimestamp >= todayTimestamp);
    this.TaskList.archived.push(...tasksToArchive);
    this.saveTaskList(this.TaskList);
    this.onChange();
  }

  /**
   * 读取归档
   */
  readArchivedTasks(date) {
    const targetDate = new Date(date);
    const targetDateTimestamp = targetDate.setHours(0, 0, 0, 0); // 获取目标日期的零点时间戳
    const nextDayTimestamp = new Date(targetDateTimestamp + 86400000); // 获取目标日期的下一天零点时间戳

    const tasksForDate = this.TaskList.archived.filter((task) => task.doneTimestamp >= targetDateTimestamp && task.doneTimestamp < nextDayTimestamp);

    // 找出所有在目标日期之前的任务
    const earlierTasks = this.TaskList.archived.filter((task) => task.doneTimestamp < targetDateTimestamp);

    // 找到最近的更早任务的日期
    let nearestEarlierDate = null;
    if (earlierTasks.length > 0) {
      // 获取最接近目标日期的任务的时间戳
      const nearestEarlierTask = earlierTasks.reduce((prev, curr) => (curr.doneTimestamp > prev.doneTimestamp ? curr : prev));
      nearestEarlierDate = new Date(nearestEarlierTask.doneTimestamp).toISOString().substring(0, 10);
    }

    return {
      tasks: tasksForDate,
      hasEarlierTasks: earlierTasks.length > 0,
      nearestEarlierDate: nearestEarlierDate,
    };
  }
}

/**
 * 生成番茄盒子的HTML
 */
function generateTomatosBoxHtml(taskTomato) {
  // 创建一个空数组，用于存放带有时间戳和对应图片地址及尺寸的对象
  let tomatoList = [];

  // 遍历 taskTomato 对象
  for (const [key, timestamps] of Object.entries(taskTomato)) {
    const imgSrc = `pic/tomato_${String(key).replace(".", "")}.svg`;

    // 将时间戳和对应图片地址存入数组
    timestamps.forEach((timestamp) => {
      tomatoList.push({ key: parseFloat(key), timestamp, imgSrc });
    });
  }

  // 按时间戳对数组进行排序
  tomatoList.sort((a, b) => a.timestamp - b.timestamp);

  // 合并图片
  if (tomatoList.length > 8) {
    const mergedTomatoList = [];
    const keyGroups = {
      1: [],
      0.8: [],
      0.6: [],
      0.4: [],
    };

    // 将不同 key 的项目分组
    tomatoList.forEach((item) => {
      if (item.key === 1) {
        keyGroups[1].push(item);
      } else if (item.key >= 0.8) {
        keyGroups[0.8].push(item);
      } else if (item.key >= 0.6) {
        keyGroups[0.6].push(item);
      } else if (item.key >= 0.3) {
        keyGroups[0.4].push(item);
      }
    });

    // 计算每组的数量并创建新项
    for (const [key, items] of Object.entries(keyGroups)) {
      if (items.length > 0) {
        mergedTomatoList.push({ key: parseFloat(key), count: items.length, imgSrc: items[0].imgSrc });
      }
    }

    // 生成最终的 HTML 字符串
    let tomatosBoxHtml = "";
    mergedTomatoList.forEach((item) => {
      tomatosBoxHtml += `<span><img src="${item.imgSrc}" style="width:${item.key * 12 + 10}px; height:${item.key * 12 + 10}px;" />×${item.count}</span>`;


    });

    return tomatosBoxHtml + tomatoTotalHtml(tomatoList.length);
  } else {
    // 生成最终的 HTML 字符串
    let tomatosBoxHtml = "";
    tomatoList.forEach((item) => {
      tomatosBoxHtml += `<img src="${item.imgSrc}" style="width:${item.key * 12 + 10}px; height:${item.key * 12 + 10}px;" />`;
    });

    return tomatosBoxHtml + tomatoTotalHtml(tomatoList.length);
  }
}

/**
 * 卡片番茄总数角标（数据复盘：每张任务卡显示累计番茄；0 时不显示，避免噪音）
 */
function tomatoTotalHtml(total) {
  if (!total) return "";
  return `<span class="tomatoTotal" title="${UI_TEXT.tomatoTotalTip(total)}"><img src="pic/tomato_1.svg" />×${total}</span>`;
}

const todoManger_ = new todoListManger("todoList");

todoManger_.onChange = function () {
  //   console.log("TaskList changed");
  // const scale = document.getElementById("scale");
  // scale.innerHTML = "";
  // let scaleId = 0;
  const doneList = document.getElementById("doneList");

  if (this.TaskList.done.length > 0) {
    doneList.innerHTML = `
    <div class=" date">
      <div class="scale">
      <div class="s short op" ></div>
      <div class="s short op" ></div>
      <div class="s mid op"   ></div>
      <div class="s short op" ></div>
      <div class="s short op" ></div>
      </div>
      <span>今天完成 ↓</span>
    </div>
    `;
  } else {
    doneList.innerHTML = "";
  }

  this.TaskList.done.forEach((task, index) => {
    let item = document.createElement("div");

    item.classList.add("taskItem");
    item.classList.add("done");

    item.setAttribute("taskId", task.id);

    item.innerHTML = `            
            <div class="scale">
              <div class="s short op" ></div>
              <div class="s short op" ></div>
              <div class="s mid op"   ></div>
              <div class="s short op" ></div>
              <div class="s short op" ></div>
            </div>
            <div class="taskContent"> 
                <div class="title">${task.title}</div>


                <div class="taskBtnBox">
                  <span taskId="${task.id}" onclick="activeTask(this,event)"   class="settopBtn">
                    <img src="pic/settop.svg" />
                  
                  </span> 
                </div>
                <div class="tomatos">
                ${generateTomatosBoxHtml(task.tomato)}
                </div>
            </div>`;

    item.addEventListener("dblclick", function (e) {
      fillEditBox(task, e);
    });
    doneList.appendChild(item);

  });

  const runingTaskTitle = document.createElement("div");
  runingTaskTitle.classList.add("date");
  runingTaskTitle.innerHTML = `
  <div class="scale">
    <div class="s short op" ></div>
    <div class="s short op" ></div>
    <div class="s mid op"   ></div>
    <div class="s short op" ></div>
    <div class="s short op" ></div>
  </div>
  <span>进行中 ↓</span>
  `;
  doneList.appendChild(runingTaskTitle);
  const todoList = document.getElementById("todoList");
  todoList.innerHTML = "";
  // console.log(this.TaskList.current);
  // 「在做」判定：存储数组 current[0]（不再用渲染首位 :first-child，渲染顺序已交给象限视图）
  const activeTaskId = this.getActiveTask().id;
  // 渲染顺序 = 象限视图（Q1→Q4，同象限新到旧）；标记重要/紧急后 onChange 重渲染即实时重排
  this.sortedCurrentTasks().forEach((task, index) => {
    let item = document.createElement("div");
    item.classList.add("taskItem");
    const isActive = task.id === activeTaskId;
    if (isActive) item.classList.add("isActive");
    item.ondblclick = function (e) {
      fillEditBox(task, e);
    };

    item.setAttribute("taskId", task.id);

    // 象限角标（Q4 一般象限无角标，保持安静）
    const quadrant = this.quadrantOf(task);
    const quadrantBadge = UI_TEXT.quadrantBadges[quadrant] ? `<div class="quadrantBadge q${quadrant}">${UI_TEXT.quadrantBadges[quadrant]}</div>` : "";

    // 归属链标签：关联了计划的任务一眼可见「计划 > 里程碑」（同名代办也分得清；
    // 超长省略，title 带完整归属链看全）
    let milestoneTag = "";
    if (task.milestoneId) {
      const found = this.findMilestone(task.milestoneId);
      if (found) {
        const chain = `${found.plan.title} > ${found.milestone.title}`;
        milestoneTag = `<div class="milestoneTag" title="${chain}">${chain}</div>`;
      }
    }

    // 计划日期徽标（dueDate 已设置时显示；点击卡片上的时钟按钮可改/清除）
    const dueTag = dueTagHtml(task);

    // 描述（计划页创建待办时填写；主列表小字展示，悬停看全文）
    const descTag = task.desc
      ? `<div class="taskDesc" title="${task.desc}">${task.desc}</div>`
      : "";

    // 专注时长徽标（statistics 聚合，任务卡直接可见；番茄盒旁边）
    const focusMin = Math.round(taskFocusMs(task) / 60000);
    const focusMsBadge = focusMin > 0
      ? `<span class="focusMsBadge" title="${UI_TEXT.taskFocusTip(focusMin, countTaskTomato(task))}">${focusMin} ${UI_TEXT.focusMinuteUnit}</span>`
      : "";

    let scale = `
    <div class="scale">
        <div class="s short op" ></div>
        <div class="s short op" ></div>
        <div class="s mid   op"   ></div>
        <div class="s short op" ></div>
        <div class="s short op" ></div>
    </div>
    `;
    if (isActive) {
      scale = `
        <div class="scale">
            <div class="s short op" ></div>
            <div class="s short op" ></div>
            <div class="s long op"   ></div>
            <div class="s short op" ></div>
            <div class="s short op" ></div>
        </div>
        `;
    }

    const impOn = task.important === true;
    const urgOn = task.urgent === true;

    item.innerHTML = `
    ${scale}
    <div class="taskContent">
        ${quadrantBadge}
        <div class="title">${task.title}</div>
        ${milestoneTag}
        ${dueTag}
        ${descTag}

        <div class="taskBtnBox">
          <span taskId="${task.id}" onclick="toggleImportantBtn(this,event)" class="markBtn imp ${impOn ? "on" : ""}" title="${impOn ? UI_TEXT.markImportantTipOn : UI_TEXT.markImportantTipOff}">${UI_TEXT.markImportant}</span>
          <span taskId="${task.id}" onclick="toggleUrgentBtn(this,event)" class="markBtn urg ${urgOn ? "on" : ""}" title="${urgOn ? UI_TEXT.markUrgentTipOn : UI_TEXT.markUrgentTipOff}">${UI_TEXT.markUrgent}</span>
          <span taskId="${task.id}" onclick="setTopTask(this,event)"   class="settopBtn">
            <img src="pic/settop.svg" />
          </span>
          <span taskId="${task.id}" onclick="deletTask(this,event)"    class="delBtn">
            <img src="pic/del.svg" />
          </span>
          <span taskId="${task.id}" onclick="compltedTask(this,event)" class="doneBtn">
            <img src="pic/done.svg" />
          </span>
        </div>
        <div class="tomatos">
            ${generateTomatosBoxHtml(task.tomato)}
            ${focusMsBadge}
        </div>
    </div>`;

    // 拖拽排序已停用：列表顺序由四象限视图派生，手动拖拽会与象限重排冲突
    todoList.appendChild(item);
  });

  if (this.TaskList.current.length == 0) {
    todoList.innerHTML = `
    <div class=" date">
      <div class="scale">
        <div class="s short op" ></div>
        <div class="s short op" ></div>
        <div class="s mid op"   ></div>
        <div class="s short op" ></div>
        <div class="s short op" ></div>
      </div>
      <span style="border:none;">未设小目标</span>
    </div>
    `;
  } else if (todoList.children.length === 0) {
    // 有待办但都不是今天（全部排在未来）：给出「今天无排期」引导而非空白
    todoList.innerHTML = `
    <div class=" date">
      <div class="scale">
        <div class="s short op" ></div>
        <div class="s short op" ></div>
        <div class="s mid op"   ></div>
        <div class="s short op" ></div>
        <div class="s short op" ></div>
      </div>
      <span style="border:none;">${UI_TEXT.todayNoDueTip}</span>
    </div>
    `;
  }

  let h = Ele_whiteBoxTop.offsetHeight + Ele_archivedList.offsetHeight + Ele_doneList.offsetHeight;

  if (taskMode) {
    Ele_listBox.scrollTo({
      top: h - 200,
      behavior: "smooth",
    });
  } else {
    Ele_listBox.scrollTo({
      top: h,
      behavior: "auto",
    });
  }

  this.isActivedTaskChanged();
};

todoManger_.onActiveTaskInfoChange = function () {
  updateTaskTitle(this.getActiveTask());
}


function compltedTask(element, event) {
  event.stopPropagation();
  const taskId = parseInt(event.target.getAttribute("taskId"));
  console.log(taskId);
  todoManger_.done(taskId);
}
function deletTask(element, event) {

  if(confirm("确定删除任务吗？\n删除后将无法恢复")){
    event.stopPropagation();
    const taskId = parseInt(event.target.getAttribute("taskId"));
    console.log(taskId);
    todoManger_.remove(taskId);
  }

}

function setTopTask(element, event) {
  event.stopPropagation();
  const taskId = parseInt(event.target.getAttribute("taskId"));
  console.log(taskId);
  todoManger_.activeTask(taskId, "current");
}

// 四象限标记按钮（卡片上实时切换，onChange 重渲染即实时重排）
function toggleImportantBtn(element, event) {
  event.stopPropagation();
  const taskId = parseInt(element.getAttribute("taskId"));
  todoManger_.toggleImportant(taskId);
}
function toggleUrgentBtn(element, event) {
  event.stopPropagation();
  const taskId = parseInt(element.getAttribute("taskId"));
  todoManger_.toggleUrgent(taskId);
}

// 计划日期弹层（自制轻量月历，同主题配色；弹在锚点正下方）
// 多选版：openDueCalendar(锚点, 当前日期数组, 回调(keys[]|null)) —— 任务卡与计划页新增表单共用
// 左键点某天 = 选中/取消（不关闭弹层，可跨月连续点）；「完成」提交，「清除」清空，点外部丢弃
let duePickerClose = null;
function openDueCalendar(anchor, currentKeys, onPick) {
  if (duePickerClose) duePickerClose(); // 重复打开：关旧开新
  const rect = anchor.getBoundingClientRect();

  // 视口月份：已有值所在月，无值 → 今天所在月
  const initial = Array.isArray(currentKeys) && currentKeys.length ? currentKeys[0] : previewLocalDateKey(new Date());
  let vy = parseInt(initial.slice(0, 4), 10);
  let vm = parseInt(initial.slice(5, 7), 10); // 1-12

  const root = document.createElement("div");
  root.className = "duePicker";
  // 定位：锚点正下方（贴边时内收，避免溢出视口）
  root.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 236)) + "px";
  root.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 292)) + "px";

  // 选中集（本地日期键；弹层内为暂存态，仅「完成」落库，「今天/清除」也在暂存集上操作）
  const sel = new Set(Array.isArray(currentKeys) ? currentKeys.filter(Boolean) : []);

  const commit = () => {
    onPick([...sel].sort());
    close();
  };

  const renderGrid = () => {
    const todayKey = previewLocalDateKey(new Date());
    // 周日起始（与活动日历同一习惯）：本月 1 号回退到首个周日
    const first = new Date(vy, vm - 1, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    let html = `<div class="dp-head">
      <span class="dp-nav" data-nav="-1" title="${UI_TEXT.duePickerPrev}">‹</span>
      <span class="dp-title">${UI_TEXT.duePickerMonthTitle(vy, vm)}</span>
      <span class="dp-nav" data-nav="1" title="${UI_TEXT.duePickerNext}">›</span>
    </div>
    <div class="dp-weeks">${UI_TEXT.duePickerWeekdays.map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="dp-days">`;
    const cur = new Date(start);
    for (let i = 0; i < 42; i++) {
      const key = previewLocalDateKey(cur);
      const cls = [
        "dp-day",
        cur.getMonth() !== vm - 1 ? "dp-other" : "",
        key === todayKey ? "dp-today" : "",
        sel.has(key) ? "dp-sel" : "",
      ].filter(Boolean).join(" ");
      html += `<span class="${cls}" data-key="${key}">${cur.getDate()}</span>`;
      cur.setDate(cur.getDate() + 1);
    }
    html += `</div>
    <div class="dp-foot">
      <div class="dp-foot-left">
        <span class="dp-today-btn">${UI_TEXT.duePickerToday}</span>
        <span class="dp-clear-btn">${UI_TEXT.duePickerClear}</span>
      </div>
      <span class="dp-done-btn">${UI_TEXT.duePickerDone(sel.size)}</span>
    </div>`;
    root.innerHTML = html;
  };

  const onPickEvent = (e) => {
    const day = e.target.closest(".dp-day");
    if (day) {
      // 左键点选 = 选中/取消切换，弹层保持打开继续多选
      const key = day.dataset.key;
      if (sel.has(key)) sel.delete(key); else sel.add(key);
      renderGrid();
      return;
    }
    const nav = e.target.closest(".dp-nav");
    if (nav) {
      const m = vm - 1 + parseInt(nav.dataset.nav, 10);
      vy += Math.floor(m / 12);
      vm = ((m % 12) + 12) % 12 + 1;
      renderGrid();
      return;
    }
    if (e.target.closest(".dp-today-btn")) {
      const key = previewLocalDateKey(new Date());
      if (sel.has(key)) sel.delete(key); else sel.add(key);
      renderGrid();
      return;
    }
    if (e.target.closest(".dp-clear-btn")) { sel.clear(); renderGrid(); return; }
    if (e.target.closest(".dp-done-btn")) { commit(); }
  };
  const onDocDown = (e) => { if (!root.contains(e.target)) close(); };
  const close = () => {
    root.remove();
    root.removeEventListener("click", onPickEvent);
    document.removeEventListener("mousedown", onDocDown);
    duePickerClose = null;
  };
  duePickerClose = close;

  renderGrid();
  root.addEventListener("click", onPickEvent);
  document.body.appendChild(root);
  // 同一帧内 mousedown 正在冒泡（锚点 click 前置），延后一拍再挂外点关闭
  setTimeout(() => document.addEventListener("mousedown", onDocDown), 0);
}

// 任务卡日期徽标仅展示状态；改期入口收敛到计划页编辑表单（openDueCalendar 通用月历保留供其使用）

function activeTask(element, event) {
  event.stopPropagation();
  const taskId = parseInt(event.target.getAttribute("taskId"));
  console.log(taskId);
  todoManger_.activeTask(taskId, "done");
}
function activeTaskFromArchived(element, event) {
  event.stopPropagation();
  const taskId = parseInt(event.target.getAttribute("taskId"));
  console.log(taskId);
  todoManger_.activeTask(taskId, "archived");

  // 如果element.parentElement.parentElement.parentElement之前的兄弟元素是date，则删除
  if (element.parentElement.parentElement.parentElement.previousElementSibling.classList.contains("date")) {
    element.parentElement.parentElement.parentElement.previousElementSibling.remove();
  }

  element.parentElement.parentElement.parentElement.remove();
}

// 示例任务对象
// const task = {
//   title: "超时收费需求设计",
//   type: "long",
//   state: "待办", //待办、进行中、完成、删除
//   createdTimestamp: 1716480000000,
//   modifiedTimestamp: 1716480000000,
//   beginTimestamp: 1716480000000,
//   endTimestamp: 1716480000000 + 10,
//   doneTimestamp: 1716480000000 + 10,
//   remindBefore: [],
//   remindAfter: [],
//   tag: 0,
//   priority: 0,
//   star: false,
//   tomato: { 1: [1716480000000, 1716480000010], 0.5: [1716480000000, 1716480000010] },
// };
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本
// task.title = "整理办公桌上的文件";
// task.description = "将办公桌上的文件分类并归档，确保每个文件都有合适的位置。";
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// task.title = "完成季度财务报告";
// task.description = "收集并分析本季度的财务数据，编写详细的报告并提交给财务总监。";
// task.tag = 2;
// task.doneTimestamp = 1716480000000 - 10;
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// console.log(todoManger_.TaskList); // 检查TaskList的内容

// task.title = "参加客户需求评审会议";
// task.description = "与客户团队进行需求评审，记录会议纪要并整理客户的反馈。";
// task.tag = 2;
// task.doneTimestamp = 1716480000000 - 24 * 60 * 60 * 1000 - 10;
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// task.title = "拜访重要客户";
// task.description = "前往客户公司，与客户进行面对面的沟通，了解他们的最新需求和反馈。";
// task.tag = 3;
// task.doneTimestamp = 1716480000000 - 2 * 24 * 60 * 60 * 1000 - 10;
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// task.title = "完成代码审查";
// task.description = "对团队成员提交的代码进行审查，提供改进建议并确保代码质量。";
// task.tag = 3;
// task.doneTimestamp = 1716480000000 - 3 * 24 * 60 * 60 * 1000 - 10;
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// task.title = "撰写新项目的详细计划";
// task.description = "根据客户需求和团队能力，撰写详细的项目计划书，包括时间表和资源分配。";
// task.tag = 3;
// task.doneTimestamp = 1716480000000 - 4 * 24 * 60 * 60 * 1000 - 10;
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// task.title = "设计新产品的原型";
// task.description = "与设计团队合作，利用设计工具创建新产品的原型，并进行初步测试。";
// task.tag = 3;
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// task.title = "组织团队建设活动";
// task.description = "安排一次团队建设活动，选择地点、活动项目，并通知所有团队成员。";
// task.tag = 3;
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// task.title = "更新公司网站内容";
// task.description = "审核并更新公司网站上的内容，确保信息准确并添加最新的新闻和公告。";
// task.tag = 3;
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// task.title = "准备员工培训材料";
// task.description = "根据培训需求，准备详细的培训材料，包括PPT、手册和练习题。";
// task.tag = 3;
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// task.title = "分析市场数据";
// task.description = "收集并分析最新的市场数据，撰写分析报告并提出市场策略建议。";
// task.tag = 3;
// todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本

// todoManger_.done(0); // 将id为0的任务标记为完成
// todoManger_.done(1); // 将id为0的任务标记为完成
// todoManger_.done(2); // 将id为0的任务标记为完成
// todoManger_.done(3); // 将id为0的任务标记为完成
// todoManger_.done(4); // 将id为0的任务标记为完成
// todoManger_.done(5); // 将id为0的任务标记为完成

todoManger_.archiveTasks(); // 将过期任务归档

function renderArchivedTasks(date, tasks) {
  // 渲染归档任务

  // const scale = document.getElementById("scale");
  const archivedList = document.getElementById("archivedList");

  tasks.reverse().forEach((task, index) => {
    let item = document.createElement("div");
    item.classList.add("taskItem");
    item.classList.add("done");
    item.ondblclick = function (e) {
      fillEditBox(task, e);
    };

    item.setAttribute("taskId", task.id);

    item.innerHTML = `      
            <div class="scale">
              <div class="s short op" ></div>
              <div class="s short op" ></div>
              <div class="s mid op"   ></div>
              <div class="s short op" ></div>
              <div class="s short op" ></div>
            </div>      
            <div class="taskContent"> 
                <div class="title">${task.title}</div>

                <div class="taskBtnBox">
                  <span taskId="${task.id}" onclick="activeTaskFromArchived(this,event)"   class="settopBtn">
                    <img src="pic/settop.svg" />
                  </span> 
                </div>
                <div class="tomatos">
                ${generateTomatosBoxHtml(task.tomato)}
                </div>
            </div>`;

    // 插入任务项到最上方
    archivedList.insertBefore(item, archivedList.firstChild);


  });

  // 开头插入日期
  const dateElement = document.createElement("div");
  dateElement.classList.add("date");
  dateElement.innerHTML = `<div class="scale">
    <div class="s short op" ></div>
    <div class="s short op" ></div>
    <div class="s mid op"   ></div>
    <div class="s short op" ></div>
    <div class="s short op" ></div>
  </div>
  <span>${date.split("-")[1]}月${date.split("-")[2]}日 ↓</span>
  `;

  archivedList.insertBefore(dateElement, archivedList.firstChild);
}

const a = todoManger_.getWorkStatistics();
// console.log(a);

todoManger_.onUpdate = (id, title) => {
  // 获取对应的标签属性taskid=id 的 element
  let element = document.querySelector(`.taskItem[taskid="${id}"]`);
  // 修改对应的文本
  element.querySelector(".title").innerText = title;
};




async function updateTaskTitle(task) {

  floatingWindow.sendMessage({ type: "updateTask", content: task });

}


todoManger_.onActiveTaskChange = updateTaskTitle;