/**
 * todo.sync 壳侧桥（client 半，运行在 vibepm 壳页面）：
 *  - 监听番茄钟 iframe 的 postMessage（env.js 上报的 TaskList 快照）→ 去抖 POST 到 node 半 todoTimer
 *  - boot 兜底：iframe 与壳同源，直读 localStorage 整包上报一次——本会话未打开番茄钟面板，
 *    node 半也能拿到上一会话数据（冷启动不空）
 *  - 每次上报成功向 ClientContext.events 派发 SYNC_EVENT，消费面板（plugin-calendar）自行刷新
 * 契约（消息类型/API 路径/存储键）全部 import 自 src/contract.ts 单一源。
 */
import {
  SYNC_MSG_TYPE, SYNC_API_PATH, SYNC_EVENT,
  taskListStorageFullKey, isTaskListLike, type TaskList,
} from "../src/contract.js";

interface BridgeEvents {
  dispatchEvent(e: Event): boolean;
}

/** 去抖 + 去重上报：同一 payload 只发一次，连发变更合并为一次 POST */
export function installTodoSyncBridge(events?: BridgeEvents): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSent = "";

  const post = (payload: TaskList): void => {
    const body = JSON.stringify({ payload });
    if (body === lastSent) return;
    lastSent = body;
    void fetch(SYNC_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).then((r) => {
      if (!r.ok) throw new Error(`${SYNC_API_PATH} → ${r.status}`);
      // 广播给同壳的消费面板（日历等）：数据已更新，可拉取最新聚合
      events?.dispatchEvent(new CustomEvent(SYNC_EVENT));
    }).catch((e) => {
      console.warn("[todo-timer] sync 上报失败:", e);
    });
  };

  const schedule = (payload: TaskList): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => post(payload), 300);
  };

  // iframe → 壳：只认契约消息类型 + 形状合法的快照
  window.addEventListener("message", (ev: MessageEvent) => {
    const data = ev.data as { type?: unknown; payload?: unknown } | null;
    if (!data || data.type !== SYNC_MSG_TYPE) return;
    if (!isTaskListLike(data.payload)) return;
    schedule(data.payload);
  });

  // boot 兜底：直读同源 localStorage（番茄钟 iframe 尚未打开时补上一会话数据）
  try {
    const raw = localStorage.getItem(taskListStorageFullKey());
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isTaskListLike(parsed)) schedule(parsed);
    }
  } catch { /* 解析失败忽略：等 iframe 打开后经 message 通道上报 */ }
}
