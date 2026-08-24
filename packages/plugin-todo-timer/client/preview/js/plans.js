/**
 * 计划页（长期目标/里程碑）渲染与交互
 *  - 数据层全部走 todoManger_（plans / milestones / 任务.milestoneId 单一源）
 *  - 文案全部走 UI_TEXT 单一源，本文件不出现用户可见字面量
 *  - 里程碑下双入口：「＋待办」直接创建（创建即归属）、「关联」挂靠已有待办；
 *    待办芯片点击就地展开编辑表单（名称/描述/日期，与创建界面一致）
 */

// 关联待办选择器当前挂靠的里程碑 id（模块级 UI 状态；null=关闭）
let linkPickerMilestoneId = null;

// 「新增待办」表单当前挂靠的里程碑 id（模块级 UI 状态；null=收起）
let taskFormMilestoneId = null;
// 表单里已选的计划日期（[]=未选；本地日期键数组，多天排期）
let taskFormDueDate = [];

// 「编辑待办」表单当前编辑的任务 id（模块级 UI 状态；null=收起）
let editingTaskId = null;
// 编辑表单里已选的计划日期（[]=未选；打开时初始化为任务现有值，多天排期）
let editFormDueDate = [];

/** HTML 属性值最小转义（input value / title 拼接防注入破版） */
function escAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

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
  // 关联待办芯片：标题 + 番茄累计（数据复盘·计划视角投入分布），点击就地编辑
  const tasks = todoManger_.tasksOfMilestone(ms.id);
  const taskChips = tasks
    .map((t) => {
      // tooltip：描述 + 计划日期 + 番茄投入（有则拼上）
      const tip = [
        t.title,
        t.desc || "",
        t.dueDate ? UI_TEXT.dueTagTip(dueDatesOf(t)) : "",
        `🍅×${countTaskTomato(t)}`,
      ].filter(Boolean).join("\n");
      return `<span class="msTask" taskId="${t.id}" title="${escAttr(tip)}">${escAttr(t.title)}<i>×${countTaskTomato(t)}</i></span>`;
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

  // 编辑待办表单（点击芯片就地展开，与创建表单同构；预填现有值，保存走 updateTaskMeta）
  let editForm = "";
  if (tasks.some((t) => t.id === editingTaskId)) {
    const et = tasks.find((t) => t.id === editingTaskId);
    editForm = `<div class="msTaskForm edit" data-taskid="${et.id}">
      <input class="msTaskTitle" type="text" value="${escAttr(et.title)}" placeholder="${UI_TEXT.planTaskTitlePlaceholder}" />
      <input class="msTaskDesc" type="text" value="${escAttr(et.desc)}" placeholder="${UI_TEXT.planTaskDescPlaceholder}" />
      <span class="msTaskDateBtn" title="${UI_TEXT.setDueBtnTip}">${UI_TEXT.planTaskDateBtn(editFormDueDate)}</span>
      <span class="msTaskSubmit">${UI_TEXT.planTaskSave}</span>
      <span class="msTaskCancel">${UI_TEXT.planTaskCancel}</span>
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
      ${editForm}
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

  // 新增待办表单开合（打开时重置日期；与编辑表单互斥）
  if (t.classList.contains("msTaskAddBtn")) {
    const msId = t.getAttribute("msId");
    if (taskFormMilestoneId === msId) {
      taskFormMilestoneId = null;
    } else {
      taskFormMilestoneId = msId;
      taskFormDueDate = [];
      editingTaskId = null;
    }
    renderPlans();
    // 展开后聚焦名称输入框（提升输入效率）
    requestAnimationFrame(() => {
      const input = document.querySelector(`.msTaskForm:not(.edit) .msTaskTitle`);
      if (input) input.focus();
    });
    return;
  }

  // 待办芯片：点击就地展开编辑表单（名称/描述/日期与创建界面一致；不再跳首页）
  // closest 兜底：芯片内的番茄计数 <i> 也是合法点击目标
  const msTaskChip = t.closest(".msTask");
  if (msTaskChip) {
    const taskId = parseInt(msTaskChip.getAttribute("taskId"));
    editingTaskId = editingTaskId === taskId ? null : taskId;
    taskFormMilestoneId = null; // 编辑与创建表单互斥
    const et = todoManger_.findTask(taskId);
    editFormDueDate = editingTaskId && et ? dueDatesOf(et) : [];
    renderPlans();
    if (editingTaskId) {
      requestAnimationFrame(() => {
        const input = document.querySelector(`.msTaskForm.edit .msTaskTitle`);
        if (input) { input.focus(); input.select(); }
      });
    }
    return;
  }

  // 表单日期按钮：弹自制月历（按所在表单模式回填对应日期状态，不立即写任务）
  if (t.classList.contains("msTaskDateBtn")) {
    const isEdit = !!t.closest(".msTaskForm.edit");
    const current = isEdit ? editFormDueDate : taskFormDueDate;
    openDueCalendar(t, current, (keys) => {
      if (isEdit) editFormDueDate = keys; else taskFormDueDate = keys;
      const btn = isEdit
        ? document.querySelector(".msTaskForm.edit .msTaskDateBtn")
        : document.querySelector(".msTaskForm:not(.edit) .msTaskDateBtn");
      if (btn) btn.textContent = UI_TEXT.planTaskDateBtn(keys);
    });
    return;
  }

  // 编辑表单取消
  if (t.classList.contains("msTaskCancel")) {
    editingTaskId = null;
    editFormDueDate = [];
    renderPlans();
    return;
  }

  // 表单提交：编辑模式（data-taskid）→ updateTaskMeta；创建模式 → 新建归属该里程碑
  if (t.classList.contains("msTaskSubmit")) {
    const form = t.closest(".msTaskForm");
    if (form.classList.contains("edit")) {
      const taskId = parseInt(form.getAttribute("data-taskid"));
      const title = form.querySelector(".msTaskTitle").value.trim();
      if (!title) {
        form.querySelector(".msTaskTitle").focus();
        return;
      }
      todoManger_.updateTaskMeta(taskId, {
        title,
        desc: form.querySelector(".msTaskDesc").value.trim(),
        dueDate: editFormDueDate.length ? editFormDueDate : null,
      });
      editingTaskId = null;
      editFormDueDate = [];
      renderPlans();
      return;
    }
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
      dueDate: taskFormDueDate.length ? taskFormDueDate : null,
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
    taskFormDueDate = [];
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
