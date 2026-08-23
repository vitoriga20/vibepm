/**
 * TODO番茄钟 · 环境与存储适配
 *  - 替代上游 utools 环境：dbStorage → localStorage
 *  - timeScale：生产 1 分钟 = 1 秒刻度（快进测试可改 1000）
 */
var timeScale = 60 * 1000;

// 时间换算单一源：1 专注分钟对应的毫秒数（realDuration 以毫秒存储，换算成分钟统一用此常量）
var MS_PER_MINUTE = 60 * 1000;

// localStorage 存储适配器（等价 utools.dbStorage）
var store = {
  getItem(key) {
    try {
      return JSON.parse(localStorage.getItem("todo-tomato:" + key));
    } catch (e) {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem("todo-tomato:" + key, JSON.stringify(value));
    } catch (e) {
      console.warn("store.setItem 失败:", key, e);
    }
  },
};

// ————————————————————————————————————————————————————————————
// 数据上报桥（vibe.todo.sync）：把 TaskList 快照 postMessage 给 vibepm 壳（父窗口），
// 由本插件 client 半（壳页面内）转发到 node 半的 todoTimer 服务（计划文档 §4 的桥）。
// 契约单一源在 src/contract.ts（SYNC_MSG_TYPE / TASKLIST_STORAGE_KEY / STORAGE_PREFIX）；
// 本页是复制式纯 JS 页面无法 import，此处保留唯一一处字面量副本，改动需两处同步。
var TODO_SYNC_MSG_TYPE = "vibe.todo.sync";
var TODO_SYNC_TASKLIST_KEY = "todoList"; // = todoListManger("todoList") 的存储键
var TODO_SYNC_ORIGIN = location.origin && location.origin !== "null" ? location.origin : "*";
// 独立打开 preview（无父壳）时不上报，页面行为零变化
var TODO_SYNC_TO_SHELL = !!(window.parent && window.parent !== window);
var todoSyncTimer = null;
var todoSyncLast = "";

function todoSyncReport() {
  if (!TODO_SYNC_TO_SHELL) return;
  var TaskList = store.getItem(TODO_SYNC_TASKLIST_KEY);
  if (!TaskList) return;
  try {
    var payload = JSON.stringify(TaskList);
    if (payload === todoSyncLast) return; // 与上次上报相同则跳过
    todoSyncLast = payload;
    window.parent.postMessage({ type: TODO_SYNC_MSG_TYPE, payload: TaskList }, TODO_SYNC_ORIGIN);
  } catch (e) {
    console.warn("todo.sync 上报失败:", e);
  }
}

function todoSyncSchedule() {
  if (!TODO_SYNC_TO_SHELL) return;
  if (todoSyncTimer) clearTimeout(todoSyncTimer);
  todoSyncTimer = setTimeout(todoSyncReport, 200); // 变更去抖：连续保存合并为一次上报
}

// 挂在存储唯一漏斗上：仅 TaskList 键触发（settings/clock 配置变更不触发）
(function () {
  var rawSetItem = store.setItem.bind(store);
  store.setItem = function (key, value) {
    rawSetItem(key, value);
    if (key === TODO_SYNC_TASKLIST_KEY) todoSyncSchedule();
  };
})();

// 首屏整包上报：上一会话的数据已在 localStorage（首次运行无数据 → todoList.js 初始化保存时经钩子上报）
todoSyncReport();

// 全局状态标志（上游 env.js 同款）
var draging = false; // 是否正在拖拽
var taskMode = false; // 是否在任务编辑模式
var stopObserving = false; // 是否停止观察
var editTaskId = null; // 当前编辑任务的id
var settingPageOpening = false; // 是否在设置页面

let isComposing = false; // 是否正在输入

// 配置单例（settingsConfig 类在 base/js/settingsConfig.js）
const settings = new settingsConfig();

var clock_ = null;
var ubWindow = null;
var contextmenuWindow = null;

// 元素绑定（上游 env.js 同款，供 todoList/drag/index 引用）
const Ele_clockBox = document.getElementById("clockBox");
const Ele_state = document.getElementById("state");
const Ele_timeText = document.getElementById("timeText");
const Ele_minutes = document.getElementById("minutes");
const Ele_seconds = document.getElementById("seconds");
const Ele_todayTomatosRedNum = document.getElementById("todayTomatosRedNum");
const Ele_todayTomatosYellowNum = document.getElementById("todayTomatosYellowNum");

const Ele_listBox = document.getElementById("listBox");
const Ele_archivedList = document.getElementById("archivedList");
const Ele_todoList = document.getElementById("todoList");
const Ele_doneList = document.getElementById("doneList");
const Ele_todoList_card = document.getElementById("todoList_card");
const Ele_scale = document.getElementById("scale");

const Ele_anchorTop = document.getElementById("anchorTop");
const Ele_anchorBottom = document.getElementById("anchorBottom");
const Ele_whiteBoxTop = document.getElementById("whiteBoxTop");
const Ele_whiteBoxBottom = document.getElementById("whiteBoxBottom");

const Ele_editingIcon = document.getElementById("editingIcon");

const Ele_settingPage = document.getElementById("settingPage");

const Ele_calendar = document.getElementById("calendar");

const Ele_calendarKey_totalDay = document.getElementById("calendarKey_totalDay");
const Ele_calendarKey_totalHour = document.getElementById("calendarKey_totalHour");
const Ele_calendarKey_totalTomato = document.getElementById("calendarKey_totalTomato");
const Ele_calendarKey_totalShortTar = document.getElementById("calendarKey_totalShortTar");

// 获取今天的YYYY-MM-DD
let historyTimePoint = new Date().toISOString().slice(0, 10);

// 排除特定的按键
const excludedKeys = new Set([
  "Shift", "Control", "Alt", "Pause", "CapsLock", "Escape",
  "PageUp", "PageDown", "End", "Home", "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown",
  "Insert", "Delete", "Meta", "ContextMenu",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "NumLock", "ScrollLock"
]);

let currentState = "idle";

let settingsPageComponent = {};

// ————————————————————————————————————————————————————————————
// 用户可见文案单一源（四象限 / 计划 / 专注耦合提示）：改动只在这里改，全链引用
var UI_TEXT = {
  // 四象限维度与象限名（索引即象限序：0=Q1 重要+紧急 … 3=Q4 一般）
  dimImportant: "重要",
  dimUrgent: "紧急",
  quadrantNames: ["重要·紧急", "重要", "紧急", "一般"],
  // 卡片象限角标（Q4 不显示角标，仅占位）
  quadrantBadges: ["重·急", "重要", "紧急", ""],
  quadrantUnitTask: "任务",
  quadrantUnitTomato: "番茄",
  // 任务卡标记按钮
  markImportant: "重",
  markUrgent: "急",
  markImportantTipOn: "取消重要",
  markImportantTipOff: "标为重要",
  markUrgentTipOn: "取消紧急",
  markUrgentTipOff: "标为紧急",
  // 任务卡计划日期（dueDate 本地日期键；选空 = 清除）
  setDueBtnTip: "计划日期（选中即保存，清空即取消）",
  dueToday: "今天",
  dueTagTip: (dateKey) => `计划日期 ${dateKey}`,
  dueTagTipOverdue: (dateKey) => `计划日期 ${dateKey}（已过期）`,
  // 计划日期弹层（自制月历）
  duePickerPrev: "上个月",
  duePickerNext: "下个月",
  duePickerMonthTitle: (y, m) => `${y}年${m}月`,
  duePickerWeekdays: ["日", "一", "二", "三", "四", "五", "六"],
  duePickerToday: "今天",
  duePickerClear: "清除日期",
  // 任务-专注耦合提示
  toastNoBoundTask: "本次专注未绑定任务：可先在待办里把一条设为在做",
  toastTomatoDone: (title, total) => `专注完成，番茄 +1 ·「${title}」累计 ${total} 个`,
  toastTomatoDoneNoTask: "专注完成，番茄 +1（未绑定任务）",
  focusIdlePrefix: "目标：",
  // 卡片番茄总数（数据复盘）
  tomatoTotalTip: (n) => `累计专注番茄 ${n} 个`,
  // 计划页
  planPageTitle: "计划",
  planActiveTitle: "进行中的计划：",
  planAddPlaceholder: "输入一个长期计划，回车创建",
  planAddBtn: "添加",
  planArchivedTitle: "已归档的计划：",
  planEmptyTip: "还没有计划，先立一个长期目标吧",
  planArchivedEmptyTip: "暂无归档计划",
  planDoneBtn: "完成计划",
  planResumeBtn: "恢复计划",
  planMilestoneAddPlaceholder: "添加里程碑，回车确认",
  planLinkBtn: "关联待办",
  planLinkClose: "完成",
  planLinkEmpty: "暂无待办可关联，先去首页添加",
  milestoneDoneTip: "取消达成",
  milestoneTodoTip: "标记达成",
  quadrantSummaryTitle: "四象限一览：",
};
