/**
 * 计划页（长期目标/里程碑）渲染与交互
 *  - 数据层全部走 todoManger_（plans / milestones / 任务.milestoneId 单一源）
 *  - 文案全部走 UI_TEXT 单一源，本文件不出现用户可见字面量
 *  - 双向关联：里程碑挂若干待办（关联待办选择器），待办芯片点击跳回首页定位（jumpToTask）
 */

// 关联待办选择器当前挂靠的里程碑 id（模块级 UI 状态；null=关闭）
let linkPickerMilestoneId = null;

// 「新增待办」表单当前挂靠的里程碑 id（模块级 UI 状态；null=收起）
let taskFormMilestoneId = null;
// 表单里已选的计划日期（""=未选；本地日期键）
let taskFormDueDate = "";

// ———————————————————— 静态文案注入 ————————————————————

document.getElementById("planPageBtn").setAttribute("data-title", UI_TEXT.planPageTitle);
document.getElementById("planActiveTitle").innerText = UI_TEXT.planActiveTitle;
document.getElementById("planArchivedTitle").innerText = UI_TEXT.planArchivedTitle;
document.getElementById("planAddInput").setAttribute("placeholder", UI_TEXT.planAddPlaceholder);
document.getElementById("planAddBtn").innerText = UI_TEXT.planAddBtn;

// ———————————————————— 渲染 ————————————————————

/**
 * 单个里程碑 HTML
 * @param {object} plan 所属计划
 * @param {object} ms 里程碑 {id, title, doneTimestamp}
 */
function milestoneHtml(plan, ms) {
  const done = !!ms.doneTimestamp;
  // 关联待办芯片：标题 + 番茄累计（数据复盘·计划视角投入分布），点击跳回首页定位
  const tasks = todoManger_.tasksOfMilestone(ms.id);
  const taskChips = tasks
    .map((t) => {
      // tooltip：描述 + 计划日期 + 番茄投入（有则拼上）
      const tip = [
        t.title,
        t.desc || "",
        t.dueDate ? UI_TEXT.dueTagTip(t.dueDate) : "",
        `🍅×${countTaskTomato(t)}`,
      ].filter(Boolean).join("\n");
      return `<span class="msTask" taskId="${t.id}" title="${tip}">${t.title}<i>×${countTaskTomato(t)}</i></span>`;
    })
    .join("");

  // 关联待办选择器（仅当前挂靠此里程碑时展开）
  let picker = "";
  if (linkPickerMilestoneId === ms.id) {
    // 候选 = 进行中待办 + 今日完成待办（去重，new 到 old 排）：已完成任务也能挂到里程碑用于复盘归因
    const seen = new Set();
    const candidates = [...todoManger_.TaskList.current, ...todoManger_.TaskList.done].filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
    picker = `<div class="msPicker">${
      candidates.length === 0
        ? `<div class="msPickerEmpty">${UI_TEXT.planLinkEmpty}</div>`
        : candidates
            .map((t) => {
              const linked = t.milestoneId === ms.id;
              return `<div class="msPickerItem ${linked ? "linked" : ""}" taskId="${t.id}" msId="${ms.id}">${t.title}</div>`;
            })
            .join("")
    }</div>`;
  }

  // 新增待办表单（仅当前挂靠此里程碑时展开；创建即归属此里程碑，非关联模式）
  let taskForm = "";
  if (taskFormMilestoneId === ms.id) {
    taskForm = `<div class="msTaskForm">
      <input class="msTaskTitle" type="text" placeholder="${UI_TEXT.planTaskTitlePlaceholder}" />
      <input class="msTaskDesc" type="text" placeholder="${UI_TEXT.planTaskDescPlaceholder}" />
      <span class="msTaskDateBtn" title="${UI_TEXT.setDueBtnTip}">${UI_TEXT.planTaskDateBtn(taskFormDueDate)}</span>
      <span class="msTaskSubmit">${UI_TEXT.planTaskSubmit}</span>
    </div>`;
  }

  return `
  <div class="milestone ${done ? "done" : ""}" msId="${ms.id}">
    <div class="msCheck" planId="${plan.id}" msId="${ms.id}" title="${done ? UI_TEXT.milestoneDoneTip : UI_TEXT.milestoneTodoTip}"></div>
    <div class="msBody">
      <div class="msTitle" contenteditable="true" planId="${plan.id}" msId="${ms.id}">${ms.title}</div>
      <div class="msTasks">
        ${taskChips}
        <span class="msLinkBtn" msId="${ms.id}">${linkPickerMilestoneId === ms.id ? UI_TEXT.planLinkClose : UI_TEXT.planLinkBtn}</span>
        <span class="msTaskAddBtn" msId="${ms.id}">${taskFormMilestoneId === ms.id ? UI_TEXT.planTaskAddClose : UI_TEXT.planTaskAddBtn}</span>
      </div>
      ${taskForm}
      ${picker}
    </div>
  </div>`;
}

/**
 * 单个计划卡片 HTML
 * @param {object} plan 计划 {id, title, state, milestones}
 * @param {boolean} archived true=归档区（只读回看 + 恢复按钮）
 */
function planCardHtml(plan, archived) {
  const total = todoManger_.planTomatoTotal(plan);
  const milestones = plan.milestones.map((ms) => milestoneHtml(plan, ms)).join("");

  const headBtn = archived
    ? `<div class="planStateBtn" act="resume" planId="${plan.id}">${UI_TEXT.planResumeBtn}</div>`
    : `<div class="planStateBtn" act="done" planId="${plan.id}">${UI_TEXT.planDoneBtn}</div>`;

  // 归档回看：不再允许添加里程碑/关联操作，仅展示（milestoneHtml 内交互在 CSS 层对 archived 隐藏）
  const addBox = archived
    ? ""
    : `<div class="msAddBox"><input class="msAddInput" type="text" planId="${plan.id}" placeholder="${UI_TEXT.planMilestoneAddPlaceholder}" /></div>`;

  return `
  <div class="planCard ${archived ? "archived" : ""}" planId="${plan.id}">
    <div class="planHead">
      <div class="planTitle" contenteditable="${archived ? "false" : "true"}" planId="${plan.id}">${plan.title}</div>
      <div class="planTomato" title="${UI_TEXT.tomatoTotalTip(total)}"><img src="pic/tomato_1.svg" />×${total}</div>
      ${headBtn}
    </div>
    <div class="milestones">${milestones}${addBox}</div>
  </div>`;
}

/**
 * 计划页整体渲染（进行中 + 归档回看两区）
 */
function renderPlans() {
  const activeBox = document.getElementById("plansActive");
  const archivedBox = document.getElementById("plansArchived");
  if (!activeBox || !archivedBox) return;

  const plans = todoManger_.TaskList.plans || [];
  const active = plans.filter((p) => p.state === "active");
  const archived = plans.filter((p) => p.state === "done");

  // 选择器挂靠的里程碑若已不存在（极端情况），自动收起
  if (linkPickerMilestoneId && !todoManger_.findMilestone(linkPickerMilestoneId)) {
    linkPickerMilestoneId = null;
  }

  // 进行中：新计划排最前
  activeBox.innerHTML = active.length
    ? active
        .slice()
        .reverse()
        .map((p) => planCardHtml(p, false))
        .join("")
    : `<div class="planEmpty">${UI_TEXT.planEmptyTip}</div>`;

  // 归档回看：最近完成的排最前
  archivedBox.innerHTML = archived.length
    ? archived
        .slice()
        .sort((a, b) => (b.doneTimestamp || 0) - (a.doneTimestamp || 0))
        .map((p) => planCardHtml(p, true))
        .join("")
    : `<div class="planEmpty">${UI_TEXT.planArchivedEmptyTip}</div>`;
}

// ———————————————————— 事件 ————————————————————

// 添加计划：按钮点击 / 输入框回车
function submitPlanAdd() {
  const input = document.getElementById("planAddInput");
  const title = input.value.trim();
  if (!title) return;
  todoManger_.addPlan(title);
  input.value = "";
}
document.getElementById("planAddBtn").addEventListener("click", submitPlanAdd);
document.getElementById("planAddInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !isComposing) {
    e.preventDefault();
    submitPlanAdd();
  }
});

// 计划页容器事件委托（进行中 / 归档两区共用）
document.getElementById("planPage").addEventListener("click", (e) => {
  const t = e.target;

  // 里程碑达成切换
  if (t.classList.contains("msCheck")) {
    todoManger_.toggleMilestone(parseInt(t.getAttribute("planId")), t.getAttribute("msId"));
    return;
  }

  // 计划完成 / 恢复
  if (t.classList.contains("planStateBtn")) {
    const planId = parseInt(t.getAttribute("planId"));
    t.getAttribute("act") === "done" ? todoManger_.completePlan(planId) : todoManger_.resumePlan(planId);
    return;
  }

  // 关联待办选择器开合
  if (t.classList.contains("msLinkBtn")) {
    const msId = t.getAttribute("msId");
    linkPickerMilestoneId = linkPickerMilestoneId === msId ? null : msId;
    renderPlans();
    return;
  }

  // 新增待办表单开合（打开时重置日期，避免上个表单的残留）
  if (t.classList.contains("msTaskAddBtn")) {
    const msId = t.getAttribute("msId");
    if (taskFormMilestoneId === msId) {
      taskFormMilestoneId = null;
    } else {
      taskFormMilestoneId = msId;
      taskFormDueDate = "";
    }
    renderPlans();
    // 展开后聚焦名称输入框（提升输入效率）
    requestAnimationFrame(() => {
      const input = document.querySelector(`.msTaskForm .msTaskTitle`);
      if (input) input.focus();
    });
    return;
  }

  // 表单日期按钮：弹自制月历（复用任务卡同款；选中回填表单状态，不立即写任务）
  if (t.classList.contains("msTaskDateBtn")) {
    openDueCalendar(t, taskFormDueDate, (key) => {
      taskFormDueDate = key || "";
      const btn = document.querySelector(".msTaskForm .msTaskDateBtn");
      if (btn) btn.textContent = UI_TEXT.planTaskDateBtn(taskFormDueDate);
    });
    return;
  }

  // 表单提交：创建待办（名称必填；描述/日期可选；创建即归属该里程碑）
  if (t.classList.contains("msTaskSubmit")) {
    const form = t.closest(".msTaskForm");
    const msId = taskFormMilestoneId;
    const title = form.querySelector(".msTaskTitle").value.trim();
    if (!title) {
      form.querySelector(".msTaskTitle").focus();
      return;
    }
    const desc = form.querySelector(".msTaskDesc").value.trim();
    todoManger_.add({
      title,
      desc,
      dueDate: taskFormDueDate || null,
      milestoneId: msId,
      type: "short",
      state: "待办",
      modifiedTimestamp: 0,
      beginTimestamp: 0,
      endTimestamp: 0,
      remindBefore: [],
      remindAfter: [],
      priority: 0,
      star: false,
      tomato: {},
    });
    taskFormMilestoneId = null;
    taskFormDueDate = "";
    renderPlans();
    return;
  }

  // 选择器内点选任务：关联 / 解除关联
  if (t.classList.contains("msPickerItem")) {
    const taskId = parseInt(t.getAttribute("taskId"));
    const msId = t.getAttribute("msId");
    const linked = t.classList.contains("linked");
    todoManger_.assignTaskToMilestone(taskId, linked ? null : msId);
    return;
  }

  // 关联待办芯片：点击跳回首页定位该任务（双向关联的「→ 待办」方向）
  if (t.classList.contains("msTask")) {
    jumpToTask(parseInt(t.getAttribute("taskId")));
    return;
  }
});

// 里程碑添加：输入框回车（委托到计划页，input 动态生成）
document.getElementById("planPage").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !isComposing && e.target.classList.contains("msAddInput")) {
    e.preventDefault();
    const title = e.target.value.trim();
    if (!title) return;
    todoManger_.addMilestone(parseInt(e.target.getAttribute("planId")), title);
  }
});

// 标题行内编辑：Enter 或失焦提交（计划标题 / 里程碑标题共用）
document.getElementById("planPage").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !isComposing && (e.target.classList.contains("planTitle") || e.target.classList.contains("msTitle"))) {
    e.preventDefault();
    e.target.blur();
  }
});
document.getElementById("planPage").addEventListener(
  "blur",
  (e) => {
    if (e.target.classList.contains("planTitle")) {
      const title = e.target.innerText.trim();
      if (title) todoManger_.updatePlanTitle(parseInt(e.target.getAttribute("planId")), title);
    } else if (e.target.classList.contains("msTitle")) {
      const title = e.target.innerText.trim();
      if (title) todoManger_.updateMilestoneTitle(parseInt(e.target.getAttribute("planId")), e.target.getAttribute("msId"), title);
    }
  },
  true // contenteditable 的 blur 不冒泡，用捕获阶段
);

// 数据变化即重渲染（实时生效，无需刷新）
todoManger_.onPlanChange = renderPlans;

// 任务侧变化（删任务/番茄累计/关联变更）也影响计划页展示
const prevOnChange = todoManger_.onChange;
todoManger_.onChange = function () {
  prevOnChange.call(this);
  // 计划页打开时才重渲染，避免首页高频 onChange 拖累
  if (document.getElementById("planPage").style.display === "flex") renderPlans();
};
