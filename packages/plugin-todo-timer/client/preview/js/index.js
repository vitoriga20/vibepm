// 页面内悬浮胶囊实例（内部驱动 TomatoClock）
const floatingWindow = new FloatingWindow();

// 页面内提示（替代桌面成功弹窗）
function showToast(msg) {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:1000;padding:10px 18px;border-radius:10px;background:var(--bg-color);color:var(--text-color);border:1px solid var(--border-color);box-shadow:0 6px 18px rgba(0,0,0,.12);font-size:13px;";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function waittingClock() {
  // 页面内同步驱动，无需等浮窗 IPC 回执：仅短暂视觉反馈后移除 waiting
  // （上游靠浮窗 messageReceived 移除；preview 无 IPC，若不移除会因 pointer-events:none 锁死控制区）
  const box = document.getElementById("controlBox");
  box.classList.add("waiting");
  setTimeout(() => box.classList.remove("waiting"), 250);
}

function clockBegin() {
  floatingWindow.sendMessage({ type: "clockBegin" });
  waittingClock();
}

function clockPause() {
  floatingWindow.sendMessage({ type: "clockPause" });
  waittingClock();
}

function clockContinue() {
  floatingWindow.sendMessage({ type: "clockContinue" });
  waittingClock();
}

function clockStop() {
  floatingWindow.sendMessage({ type: "clockStop" });
  waittingClock();
}

async function onWorkEnd(duration, progress) {
  // 时长持久化：只要专注过（progress>0）就落账——修复「专注一段时间但不足 30% 全部丢失」
  // 番茄个数的 ≥0.3 有效门槛保留在 addTomatoToTask 内（时长与个数口径分离）
  if (progress > 0) {
    // 任务-专注耦合：番茄只累计到「开始专注时锁定的绑定任务」（boundTaskId），其它任务不受影响
    const boundTaskId = floatingWindow.clock.config.boundTaskId;
    const result = todoManger_.addTomatoToTask(boundTaskId, duration, progress);
    // 完成反馈：满门槛 → 本次番茄 +1 + 该任务累计总数；不足 → 时长已记录提示；未绑定任务 → 明确提示
    if (settings.config.showSuccessPopup) {
      if (result.partial) {
        showToast(UI_TEXT.toastPartialFocus(Math.round((duration * progress) / 60000)));
      } else {
        showToast(result.title ? UI_TEXT.toastTomatoDone(result.title, result.total) : UI_TEXT.toastTomatoDoneNoTask);
      }
    }
    updatePageTodayTomatosNum();
  }
}

function updatePageTodayTomatosNum() {
  const statisticsTodayNum = todoManger_.statisticsTodayNum();
  Ele_todayTomatosRedNum.innerText = statisticsTodayNum.red;
  Ele_todayTomatosYellowNum.innerText = statisticsTodayNum.yellow;
  document.getElementById("focusHours").innerText = `${statisticsTodayNum.focusMinutes} min`;
}

// 四象限汇总渲染（验收四·3：各象限任务数与番茄投入一览；文案全部走 UI_TEXT 单一源）
function renderQuadrantSummary() {
  const box = document.getElementById("quadrantSummary");
  const title = document.getElementById("quadrantSummaryTitle");
  if (!box || !title) return;
  title.innerText = UI_TEXT.quadrantSummaryTitle;
  const summary = todoManger_.getQuadrantSummary();
  box.innerHTML = summary
    .map(
      (s) => `
    <div class="quadrantCell q${s.quadrant}">
      <div class="quadrantName">${UI_TEXT.quadrantNames[s.quadrant]}</div>
      <div class="quadrantNums">
        <span>${s.taskCount} ${UI_TEXT.quadrantUnitTask}</span>
        <span>${s.tomatoCount} ${UI_TEXT.quadrantUnitTomato}</span>
      </div>
    </div>`
    )
    .join("");
}

// 计划页「关联待办」点击跳回首页定位任务（验收三·3：双向关联，里程碑 ↔ 待办可点击跳转）
function jumpToTask(taskId) {
  pages.switchPage(0);
  // 等切页与重渲染完成后定位（switchPage 内有异步滚动，用 rAF 排到下一帧）
  requestAnimationFrame(() => {
    const el = document.querySelector(`#todoList .taskItem[taskId="${taskId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1600);
  });
}

async function onBreakEnd(duration, type, progress) {
  todoManger_.recordStatistics(duration, type, progress);
  if (settings.config.showSuccessPopup) {
    showToast("休息结束");
  }
}

// ——————————————————————————————————————————————————

// 任务列表缩放适配
function scaleFloating(e) {
  if (settingPageOpening) return;
  const mouseY = e.clientY;

  const items = Ele_listBox.getElementsByClassName("s");
  Array.from(items).forEach((item) => {
    const itemRect = item.getBoundingClientRect();
    const itemCenterY = itemRect.top + itemRect.height / 2;
    const distance = Math.abs(mouseY - itemCenterY);
    const maxDistance = 60;

    if (distance > maxDistance) {
      item.style.width = "";

      item.style.opacity = "";
      return;
    }
    const scale = Math.cos(Math.PI * (distance / maxDistance)) + 1;

    // item.style.transform = `scaleX(${scale})`;

    if (item.classList.contains("short")) {
      item.style.width = `${2 * scale + 2}px`;
    } else if (item.classList.contains("mid")) {
      item.style.width = `${8 * scale + 6}px`;
    } else if (item.classList.contains("long")) {
      item.style.width = `${6 * scale + 24}px`;
    }
    item.style.opacity = 0.3 * scale + 0.4;
  });
}
// 监听悬浮窗鼠标移动事件,更新缩放适配
Ele_listBox.addEventListener("mousemove", scaleFloating);

// ——————————————————————————————————————————————

// 获取编辑器元素
const editor = document.getElementById("editor");

// 处理输入法开始输入事件
editor.addEventListener("compositionstart", () => {
  isComposing = true;
});

// 处理输入法输入内容更新事件
editor.addEventListener("compositionupdate", (event) => {
  console.log("正在输入:", event.data);
});

// 处理输入法输入结束事件
editor.addEventListener("compositionend", (event) => {
  isComposing = false;
  console.log("输入结束，最终内容:", event.data);
  onEditInput();
});

// 更新编辑器空状态
function updateEmptyState() {
  if (editor.textContent.trim() === "") {
    editor.classList.add("empty");
  } else {
    editor.classList.remove("empty");
  }
}

// 监听#按键输入
editor.addEventListener("keydown", function (event) {
  // console.log("keydown", event);

  // event.preventDefault();
  if (event.key === "excape") {
    event.preventDefault();
    event.stopPropagation();
    exitEditModel();
  }

  if (event.key === "Enter" && !isComposing) {
    submitTask(event);
  }
});
// 提交任务
function submitTask(event) {
  event.preventDefault();
  event.stopPropagation();
  editor.focus();
  if (editor.textContent.trim() === "") {
    return;
  }

  if (editTaskId != null) return;

  // 主界面新增待办：必须关联里程碑（计划驱动的待办都有归属）
  const msSelect = document.getElementById("msSelect");
  const msId = msSelect ? msSelect.value : "";
  if (!msId) {
    showToast(UI_TEXT.msSelectRequired);
    return;
  }

  let task = {
    title: editor.textContent.trim(),
    type: "short",
    state: "待办", //待办、进行中、完成、删除
    desc: "",
    milestoneId: msId,
    // 首页创建的待办默认就是「今天做」：带上当天日期（之后可用时钟按钮改期/清除）
    dueDate: previewLocalDateKey(new Date()),
    // 当前时间戳
    createdTimestamp: Date.now(),
    modifiedTimestamp: 0,
    beginTimestamp: 0,
    endTimestamp: 0,
    remindBefore: [],
    remindAfter: [],
    priority: 0,
    star: false,
    tomato: {},
  };

  todoManger_.add({ ...task }); // 使用扩展运算符创建任务的副本
  // 聚焦到编辑器
  // editor.focus();
  editor.innerHTML = "";
  editor.classList.add("empty");

  Ele_listBox.scrollTo({
    top: Ele_listBox.scrollHeight - Ele_listBox.clientHeight - 200,
    behavior: "smooth",
  });
  // enterTaskMode("bottom");
}
// 退出编辑模式
function exitEditModel() {
  console.log("exitEditModel");

  Ele_listBox.classList.remove("editingMask");
  Ele_editingIcon.style.display = "";
  editor.innerHTML = "";
  editor.classList.add("empty");
  editTaskId = null;
  document.querySelectorAll(".editingItem").forEach((item) => {
    item.classList.remove("editingItem");
  });
}
// 填充编辑器
function fillEditBox(task, e) {
  e.stopPropagation();
  console.log(e.currentTarget);

  // 所有taskItem元素移除editingItem类
  document.querySelectorAll(".editingItem").forEach((item) => {
    item.classList.remove("editingItem");
  });

  Ele_listBox.classList.add("editingMask");

  Ele_editingIcon.style.display = "flex";

  e.currentTarget.classList.add("editingItem");
  console.log(e.currentTarget);

  console.log("fillEditBox", task);
  editor.focus();
  editor.innerHTML = task.title;
  editor.classList.remove("empty");
  editor.classList.add("editing");
  editTaskId = task.id;
}

// 监听 editor 的 focus 事件
editor.addEventListener("focus", function (e) {
  if (taskMode) return;
  enterTaskMode("bottom");
});

// 处理编辑器输入事件
function onEditInput() {
  console.log("input", editor.textContent, "|");
  if (editor.textContent == "" || editor.textContent == "\n" || editor.textContent == "<br>") {
    editor.classList.add("empty");
  } else {
    editor.classList.remove("empty");
    // enterTaskMode();
  }

  if (isComposing) {
    return;
  }

  // 获取光标位置
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const offset = range.startOffset;
  const node = range.startContainer;

  // // 保持文本内容
  let text = editor.textContent;
  editor.innerHTML = text;
  restoreCaretPosition(editor, node.parentNode, offset);

  console.log("输入法输入结束，内容为：", editor.textContent);
  if (editTaskId != null) {
    todoManger_.update(editTaskId, editor.textContent.trim());
    // exitEditModel();
    // return;
  }
}

// 处理一般输入事件
editor.addEventListener("input", function (e) {
  onEditInput();
});
// 恢复光标位置
function restoreCaretPosition(element, node, offset) {
  const range = document.createRange();
  const selection = window.getSelection();

  // 修正光标位置
  let newNode = element.firstChild;
  let newOffset = offset;

  // 处理文本节点的情况
  while (newNode && newNode.nodeType === Node.TEXT_NODE && newNode !== node) {
    if (newNode.textContent.length < offset) {
      newOffset -= newNode.textContent.length;
      newNode = newNode.nextSibling;
    } else {
      break;
    }
  }

  if (newNode) {
    range.setStart(newNode, newOffset);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
  }
}

let scrollTimer = null;

// 监听元素的交叉事件
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        if (!taskMode && entry.target.id == "whiteBoxTop") {
          Ele_todoList.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        } else if (!taskMode && entry.target.id == "whiteBoxBottom") {
          // 如果todoList 元素高度高于listBox高度，对齐底部
          if (Ele_todoList.offsetHeight < Ele_listBox.clientHeight) {
            Ele_todoList.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          } else {
            console.log("scrollIntoView 高度大于");
            Ele_todoList.scrollIntoView({
              behavior: "smooth",
              block: "end",
            });
          }
        } else if (taskMode && entry.target.id == "whiteBoxTop") {
          if (stopObserving) return;

          while (true) {
            if (historyTimePoint == 0) {
              Ele_anchorTop.classList.remove("hidden");
              return;
            }

            const archivedList = todoManger_.readArchivedTasks(historyTimePoint);
            if (archivedList.tasks.length == 0 && archivedList.hasEarlierTasks) {
              // 今天没有、之前有，继续遍历，更新时间点
              historyTimePoint = archivedList.nearestEarlierDate;
              continue;
            } else if (archivedList.tasks.length == 0 && !archivedList.hasEarlierTasks) {
              // 今天没有、之前没有，结束遍历
              return;
            } else if (archivedList.tasks.length > 0 && archivedList.hasEarlierTasks) {
              // 今天有、之前有，结束遍历
              renderArchivedTasks(historyTimePoint, archivedList.tasks);
              historyTimePoint = archivedList.nearestEarlierDate;
              Ele_listBox.scrollTo({
                top: 150,
                behavior: "smooth",
              });
              return;
            } else {
              // 今天有、之前没有
              renderArchivedTasks(historyTimePoint, archivedList.tasks);
              historyTimePoint = 0;
              Ele_listBox.scrollTo({
                top: 150,
                behavior: "smooth",
              });
              return;
            }
          }
        }
      }
    });
  },
  {
    root: Ele_listBox,
    threshold: 1,
  }
);

let in_animation = false;
// ---------------------------------------------------
// 进入任务模式
function enterTaskMode(arrow = "top") {
  in_animation = true;
  taskMode = true;
  console.log("enterTaskMode", arrow);

  document.getElementById("mainBody").classList.add("taskMode");

  // 拖拽排序已停用：列表顺序由四象限视图派生（sortedCurrentTasks），手动拖拽会与象限重排冲突

  let scrollInterval = setInterval(() => {
    if (arrow == "top") {
      Ele_listBox.scrollTo({
        top: 150 + Ele_doneList.offsetHeight,
        behavior: "instant",
      });
    } else {
      Ele_listBox.scrollTo({
        top: Ele_listBox.scrollHeight - Ele_listBox.clientHeight,
        behavior: "instant",
      });
    }
  }, 0);

  setTimeout(() => {
    clearInterval(scrollInterval);
  }, 600);

  setTimeout(() => {
    in_animation = false;
  }, 900);
}
let centerScrollY = 0;

// 退出任务模式
function exitTaskMode() {
  console.log("exitTaskMode", in_animation);
  if (in_animation) return;
  stopObserving = true;

  setTimeout(() => {
    stopObserving = false;
    taskMode = false;
  }, 800);

  document.getElementById("mainBody").classList.remove("taskMode");



  Ele_archivedList.innerHTML = "";
  historyTimePoint = new Date().toISOString().slice(0, 10);
  Ele_anchorTop.classList.add("hidden");

  let scrollInterval = setInterval(() => {
    Ele_todoList.scrollIntoView({
      behavior: "auto", // 平滑滚动
      block: "start", // 垂直对齐方式: "start" | "center" | "end" | "nearest"
    });
  }, 0);

  // 800ms后停止滚动(与CSS动画时长相同)
  setTimeout(() => {
    clearInterval(scrollInterval);
  }, 800);
}

//监听按键输入，进入或退出任务模式
document.addEventListener("keydown", function (event) {
  if (settingPageOpening) return;

  if (taskMode && event.key === "Escape") {
    event.stopPropagation();
    console.log("taskMode Escape", document.activeElement === editor);

    if (editor.textContent.trim() != "") {
      editor.innerHTML = "";
      editor.classList.add("empty");
      editor.blur();
    } else if (document.activeElement === editor) {
      editor.blur();
    } else {
      exitTaskMode();
    }
  } else if (!excludedKeys.has(event.key)) {

    editor.focus();
  }
});

// 点击任务列表卡片
document.getElementById("todoList_card").onclick = function (e) {
  console.log("todoList_card click");
  e.stopPropagation();

  if (editTaskId != null) {
    exitEditModel();
  }

  if (taskMode || draging) return;
  console.log("进入任务模式，点击任务列表卡片");
  enterTaskMode();
  // e.preventDefault();
};

document.getElementById("whiteBoxTop").onclick = function (e) {
  if (taskMode) return;
  e.stopPropagation();
  console.log("whiteBoxTop click");
  enterTaskMode("top");
};

document.getElementById("whiteBoxBottom").onclick = function (e) {
  if (taskMode) return;
  e.stopPropagation();
  console.log("whiteBoxBottom click");

  enterTaskMode("bottom");
};

// ————————————————————————————————————————————————————————————

// ————————————————————————————————————————————————————————————

document.body.onclick = function (e) {
  console.log("body click");
  if (editTaskId != null) {
    exitEditModel();
    return;
  }
  if (taskMode) {
    exitTaskMode();
  }
};

editor.onclick = function (e) {
  console.log("editor click");
  e.stopPropagation();
};

settingsPageComponent = [
  {
    name: "autoWork",
    type: "switch",
    component: new Switch("autoWork", settings, "autoWork"),
  },
  {
    name: "autoBreak",
    type: "switch",
    component: new Switch("autoBreak", settings, "autoBreak"),
  },
  {
    name: "showSuccessPopup",
    type: "switch",
    component: new Switch("showSuccessPopup", settings, "showSuccessPopup"),
  },
  {
    name: "showFloatingWindow",
    type: "switch",
    component: new Switch("showFloatingWindow", settings, "showFloatingWindow"),
  },
  {
    name: "showTomatoAnimation",
    type: "switch",
    component: new Switch("showTomatoAnimation", settings, "showTomatoAnimation"),
  },
  {
    name: "workDuration",
    type: "slider",
    component: new Slider("slider-container-workDuration", "slider-thumb-workDuration", 5, 120, 0, 5, "min", settings, "workDuration"),
  },
  {
    name: "shortBreakDuration",
    type: "slider",
    component: new Slider("slider-container-shortBreakDuration", "slider-thumb-shortBreakDuration", 1, 20, 0, 1, "min", settings, "shortBreakDuration"),
  },
  {
    name: "longBreakDuration",
    type: "slider",
    component: new Slider("slider-container-longBreakDuration", "slider-thumb-longBreakDuration", 5, 60, 0, 5, "min", settings, "longBreakDuration"),
  },
  {
    name: "longBreakInterval",
    type: "slider",
    component: new Slider("slider-container-longBreakInterval", "slider-thumb-longBreakInterval", 2, 10, 0, 1, "", settings, "longBreakInterval"),
  },
  {
    name: "autoHideAni",
    type: "switch",
    component: new Switch("autoHideAni", settings, "autoHideAni"),
  },
  {
    name: "opacity",
    type: "slider",
    component: new Slider("slider-container-opacity", "slider-thumb-opacity", 0.3, 1, 2, 0.01, "", settings, "opacity", "update"),
  },
];

settings.onClockChange = (event) => {
  console.log("settings changed", settings.config);
  floatingWindow.sendMessage({ type: "clockSettingChanged", content: event });
};

settings.onShowFloatingWindowChange = (state) => {
  floatingWindow.refresh();
};

settings.onShowTomatoAnimationChange = (state) => {
  floatingWindow.refresh();
};

settings.onAutoHideAniChange = (state) => {
  floatingWindow.refresh();
};

function setDarkMode(state) {
  switch (state) {
    case "dark":
      console.log("setDarkMode dark");
      document.documentElement.setAttribute("data-theme", "dark");
      break;
    case "light":
      console.log("setDarkMode light");
      document.documentElement.removeAttribute("data-theme");
      break;
    case "auto":
      const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (isDark) {
        console.log("setDarkMode auto dark");
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        console.log("setDarkMode auto light");
        document.documentElement.removeAttribute("data-theme");
      }
      break;
  }
}

settings.onDarkModeChange = (state) => {
  console.log("onDarkModeChange", state);
  setDarkMode(state);
};

settings.onOpacityChange = (state) => {
  floatingWindow.refresh();
};

class Pages {
  constructor() {
    this.clockPage = document.getElementById("clockPage");
    this.planPage = document.getElementById("planPage");
    this.statisticPage = document.getElementById("statisticPage");
    this.settingPage = document.getElementById("settingPage");
    this.userPage = document.getElementById("userPage");

    this.pages = [
      { name: "clockPage", pageEle: this.clockPage, btnEle: document.getElementById("clockPageBtn") },
      { name: "planPage", pageEle: this.planPage, btnEle: document.getElementById("planPageBtn") },
      { name: "statisticPage", pageEle: this.statisticPage, btnEle: document.getElementById("statisticPageBtn") },
      { name: "settingPage", pageEle: this.settingPage, btnEle: document.getElementById("settingPageBtn"), componentsList: settingsPageComponent },
    ];

    this.switchPage(0);

    // Ele_listBox.scrollTo({
    //   top: Ele_listBox.scrollHeight - Ele_listBox.clientHeight - 200,
    //   behavior: "smooth",
    // });

    observer.observe(document.getElementById("whiteBoxTop"));
    observer.observe(document.getElementById("whiteBoxBottom"));
  }

  switchPage(index) {
    if (index != 0) {
      settingPageOpening = true;
    } else {
      settingPageOpening = false;
    }

    this.pages.forEach((page) => {
      page.pageEle.style.display = "none";
      page.btnEle.classList.remove("activeSvg");
    });

    this.pages[index].btnEle.classList.add("activeSvg");

    this.pages[index].pageEle.style.display = "flex";
    console.log("switchPage", this.pages[index].name);

    if (this.pages[index].componentsList) {
      this.pages[index].componentsList.forEach((component) => {
        component.component.render();
      });
    }

    switch (this.pages[index].name) {
      case "clockPage":
        exitTaskMode();
        break;
      case "planPage":
        // 计划页渲染（renderPlans 由 plans.js 提供）
        renderPlans();
        break;
      case "statisticPage":
        const workStatistics = todoManger_.getWorkStatistics();

        // 刷新日历
        Ele_calendarKey_totalDay.innerText = workStatistics.totalDay;
        Ele_calendarKey_totalHour.innerText = workStatistics.totalMinute;
        Ele_calendarKey_totalTomato.innerText = workStatistics.totalTomato;
        Ele_calendarKey_totalShortTar.innerText = workStatistics.totalShortTar;

        const WorkDateDistribution = todoManger_.getWorkDateDistribution();

        // 获取当前日期，格式为"2024-05-29"
        const currentDate = new Date().toISOString().slice(0, 10);

        // 刷新日历
        const calendar = new GitHubCalendar("calendar", currentDate, 12);
        calendar.setData(WorkDateDistribution);

        // 四象限汇总（任务数与番茄投入一览）
        renderQuadrantSummary();

        break;
      case "settingPage":
        break;
    }

    // 指示器：按激活按钮实际位置定位（不再依赖固定按钮数偏移）
    const indicator = document.getElementById("indicator");
    const activeBtn = this.pages[index].btnEle;
    if (indicator && activeBtn) {
      indicator.style.top = `${activeBtn.offsetTop + activeBtn.offsetHeight / 2 - 20}px`;
    }
  }
}

const pages = new Pages();

// 设置页「确定」：重读配置并整体重渲染（无需手动刷新）
function onConfirmSettings() {
  settings.reload();
  // 重渲染全部设置控件的真实状态
  settingsPageComponent.forEach((c) => c.component.render());
  showToast("配置已应用");
}
// 为所有page类元素添加点击事件
// const pageBtnElements = document.getElementsByClassName("btnBox");
// for (let i = 0; i < pageBtnElements.length; i++) {
//   pageBtnElements[i].onclick = () => pages.switchPage(i);
// }
pages.pages.forEach((page, index) => {
  if (page.btnEle) {
    page.btnEle.onclick = () => pages.switchPage(index);
  }
});

updatePageTodayTomatosNum();

// ———— 主界面新增待办的里程碑下拉（必选）：数据源 = 进行中计划的未完成里程碑 ————
function renderMsSelect() {
  const sel = document.getElementById("msSelect");
  if (!sel) return;
  const prev = sel.value;
  const plans = (todoManger_.TaskList.plans || []).filter((p) => p.state === "active");
  const opts = [];
  for (const p of plans) {
    for (const ms of p.milestones || []) {
      if (ms.doneTimestamp) continue;
      opts.push({ id: ms.id, label: `${p.title} · ${ms.title}` });
    }
  }
  sel.innerHTML = `<option value="">${UI_TEXT.msSelectPlaceholder}</option>`
    + opts.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
  // 连续添加同里程碑的多个待办：保留上次选择
  if (prev && opts.some((o) => o.id === prev)) sel.value = prev;
}
renderMsSelect();
// 计划/里程碑增删改 → 下拉同步（链式挂接，不破坏 plans.js 已挂的 renderPlans）
const prevOnPlanChangeForSelect = todoManger_.onPlanChange;
todoManger_.onPlanChange = function () {
  prevOnPlanChangeForSelect.call(this);
  renderMsSelect();
};

function triggerActionOnDayChange(action) {
  let lastCheckedDate = new Date().getDate();

  setInterval(() => {
    const currentDate = new Date().getDate();
    if (currentDate !== lastCheckedDate) {
      lastCheckedDate = currentDate;
      action();
    }
  }, 1000 * 60); // 每分钟检查一次
}

// 示例动作：跨天归档
function OnDayChange() {
  todoManger_.archiveTasks();
  updatePageTodayTomatosNum();
  // 主列表按天视图：跨天后新到期待办自动出现（如 8/25 排期的活到点显示）
  todoManger_.onChange();
}

// 启动跨天检测
triggerActionOnDayChange(OnDayChange);

// 页面加载即应用主题（替代 utools.onPluginEnter 入口分发）
setDarkMode(settings.config.darkMode);

const darkModeSwitch = new Select("darkModeSwitch", settings, "darkMode", [
  { value: "light", label: "明亮模式", icon: "pic/darkMode-light.svg" },
  { value: "dark", label: "深色模式", icon: "pic/darkMode-dark.svg" },
  { value: "auto", label: "跟随系统", icon: "pic/darkMode-auto.svg" },
]);
