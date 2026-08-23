# 番茄钟数据服务化 + 独立日历插件联合 · 方案文档

日期：2026-08-23
范围：`vibepm-ts`（插件化内核 + 番茄钟插件 `plugin-todo-timer` + 新增 `plugin-calendar`）
状态：已实现并真机验收通过（2026-08-23，见文末执行记录）
参考：`2026-08-19-todo-tomato.md`、`2026-08-22-todo-tomato-enhance.md`

---

## 1. 背景与目标

### 现状
- vibepm 是插件化内核，插件通过 `package.json` 的 `vibepm` 元数据声明 `inject` / `provide` / `slots`；运行时用 `ctx.provide(name, svc)` 提供能力、`ctx.get(name)` 获取依赖（参照 `plugin-storage` 的 `provide: ["db"]` 范例）。
- UI 插件经 `ctx.get("slots").register("shell.primary" | "shell.nav", {...})` 挂到界面（参照 `plugin-todo-timer/src/index.ts`）。
- 番茄钟数据（`statistics / current / done / archived / longTagList`）**封在 iframe 预览页的浏览器 localStorage**（`todo-tomato:` 前缀，见 `client/preview/js/env.js`），`src/index.ts` 的 node 半 `provide: []`，**没有任何业务 API**。

### 目标
把番茄钟的统计/任务数据**服务化暴露到内核（node 半）**，再新增一个**独立日历插件**，通过注入消费这份数据并挂载日历视图，实现「专注 + 任务 + 长目标」多维度日历。改动收敛在插件边界，互不侵入对方内部。

---

## 2. 设计原则（复用既有内核范式，不造新轮子）

1. **能力服务化 + 注入**：番茄钟出的不是"几个函数"，而是一个挂在 `ctx` 上的 service（类似 `ctx.fs` / `plugin-storage` 的 `db`），由 `ctx.provide("todoTimer", svc)` 暴露；消费方只 `inject` 它。
2. **能力与表现分离**：番茄钟这份 iframe 页面是"表现"，统计/任务数据抽到 node 半 service（provider）；日历插件同样是纯表现。两层都不改对方内部。
3. **单一可配置源、全链引用**：边 service 名 / 消息类型 / 数据结构字段名等一律抽到配置常量源，禁止第二处写字面量（遵守项目禁用硬编码约束）。
4. **真机验证为准**：任一功能实现完成必须真机跑通方可宣告可用。

---

## 3. 对外数据契约（服务协议）

```
service 名：todoTimer
挂载处：ctx.todoTimer（node 半，由 plugin-todo-timer provide）

结构（沿用番茄钟 TaskList，字段级兼容旧数据）：
  statistics[]: { endTimestamp, realDuration, type, tarId, longTarId, title?, tagName? }
  current / done / archived[]: { id, title, tag, doneTimestamp, ... }
  longTagList{}: { name, color, state }

消费语义：
  专注维度     ← statistics[].type === "work" 的 realDuration / 条数
  任务完成     ← done/archived[].doneTimestamp 命中目标日期（title + tag）
  长目标投入   ← statistics[].longTarId 聚合
```

> 注意：`statistics` 旧记录无 `title / tagName`（新增写入才有）。渲染端对缺失值回退为 `[未知·tag]`，不报错。

---

## 4. 方案：桥上报 + 服务注入（最小侵入）

```
preview iframe (localStorage)
   │  client/preview/js/env.js 注入"数据上报"：
   │     · 变更是 postMessage 立即上报快照 / 首屏整包上报
   │     · parent.postMessage({ type:'vibe.todo.sync', payload:TaskList }, '*')   ← 同源，安全
   ▼
plugin-todo-timer node 半
   │  监听 window 的 message → 缓存 TaskList 快照
   │  apply(ctx) 里 ctx.provide('todoTimer', {
   │       getDistribution(), getStatistics(), getSnapshot()
   │     })
   ▼
plugin-calendar node 半
   │  inject:['slots','todoTimer']
   │  apply(ctx) { ctx.get('todoTimer').getDistribution() ; ctx.get('slots').register('shell.primary', { id:'calendar/panel', label:'活动日历', route:'calendar' }) }
   ▼
日历面板（独立 package · 挂 shell.primary 路由 calendar）
```

要点：
- **iframe 与父壳同源**（preview 由壳 `/plugins/<id>/preview/` 静态服务），`window.parent.postMessage` 无需跨域处理；`preview/js/theme.js` 已证明 `PARENT = window.parent` 可访问。
- 番茄钟预览页面**零 UI 改动**，只动 `env.js` 加一次上报 + node 半加一个 provider。
- 日历插件完全独立（新 package），通过 `inject` 声明依赖，松耦合。

---

## 5. 目录/包结构（提议）

```
packages/
  plugin-todo-timer/            # 新增：node 半提供 todoTimer service + iframe 上报桥
    src/index.ts                # 扩 ctx.provide('todoTimer', svc) + message 监听
    client/preview/js/env.js    # 加数据上报（postMessage）
  plugin-calendar/              # 新增独立包
    package.json                # vibepm: node.inject ['slots','todoTimer']，client entry
    src/index.ts                # ctx.get('todoTimer') + slots.register 日历面板
    client/index.ts             # 定义 <calendar-panel>（同 tomato-timer 的 render.register 套路）
    client/components.ts        # 日历渲染：多维度色条 + tooltip
```

---

## 6. 影响面 / 链路 / 风险

| 影响面 | 改动 | 风险 |
|---|---|---|
| `plugin-todo-timer/src/index.ts` | 加 `ctx.provide('todoTimer')` + message 监听 | 低（新增不破坏现有注册） |
| `client/preview/js/env.js` | 加 postMessage 上报 | 中（需不干扰页面逻辑，做 app 独立） |
| 新增 `plugin-calendar` | 全新独立包 | 低（不影响既有插件启动） |
| 历史数据 | 旧 `statistics` 无 title/tagName | 高（需渲染回退 `[未知·tag]`） |
| 时区口径 | ISO(UTC) 与本地零点可能错位 | 高（聚合统一按本地日期，见下） |

关键链路提醒：
- 若做「任务完成」与「专注」同格叠加，两类事件的日期口径必须统一为**本地日期**，否则跨天错位——聚合函数内部做归一化。
- `ctx.provide` 注册顺序：日历插件 `inject:['todoTimer']` 依赖番茄钟先加载；用包装元数据的 `order` + 内核依赖解析保障，勿依赖加载时序的巧合。

---

## 7. 真机验收清单

1. `iframe` 首次加载即把整包 TaskList 上报，node 半 `ctx.get('todoTimer').getSnapshot()` 能取到。
2. 番茄钟内新增任务 / 完成一个番茄后，不刷新日历面板即可看到最新数据（上报触发更新）。
3. 日历面板渲染出多维度（专注时长 / 当日完成任务 / 长目标投入）色条；同日多长目标按占比堆叠且色相与 `longTagList` 一致。
4. 老数据（含 `statistics` 缺 title）的记录不报错，回退显示 `[未知·tag]`。
5. 跨天（UTC 与本地时区）的任务与专注落在同一天同一格，无错位。
6. tooltip 文案无占位残留、无英文残留（长目标 name 除外）。
7. `remove()` 任务后，该任务的旧活动仍在日历可见（依赖上报快照里已含数据，不依赖反查）。
8. 番茄钟自身功能（时钟/待办/统计/设置）在加桥后零回退。

---

## 8. 落地节奏（建议）

1. **最小钥匙验证（真机）**：只在 `env.js` 加一次 postMessage 上报 + node 半监听打印，确认数据能出 iframe → 通过后再动架构。
2. 番茄钟 node 半暴露 `ctx.todoTimer` service（聚合 + 快照）。
3. 独立 `plugin-calendar`：先静态渲染快照，再接 `ctx.get('todoTimer')`，最后接实时上报更新。
4. 多维度色块与 tooltip 增强、时区归一化、老数据兜底。
5. 验收清单全量真机通过后交付。

---

## 9. 对比备选方案（记录留存）

- **方案 B（收口共享存储）**：番茄钟把 TaskList 同步写入 `plugin-storage` 的 `db`，日历从同一 db 读。更"单源"，但同样要先打通 iframe→内核通道，且动预览存储链路，侵入更大。当前选 A（服务注入为主），B 留作后续单源化演进。

---

## 10. 执行记录（2026-08-23 实现，含对本文档的修正）

按原方案落地，以下 4 处依代码现状修正（原文未更新到当前数据模型）：

1. **链路补一段壳侧桥**：原文「node 半监听 window 的 message」物理不可达（node 半在 Node 进程）。
   实际链路：`env.js store.setItem("todoList") 钩子 + 首屏整包 → postMessage → 壳内 client 半桥（client/bridge.ts，去抖+去重）→ POST /api/todo-timer/sync → TodoTimerService`。
   另补**冷启动兜底**：壳与 iframe 同源，client 半 boot 直读 localStorage 整包上报一次（本会话未开番茄钟也有上一会话数据）。
2. **数据契约以当前代码为准**：`longTagList/longTarId/tagName` 已被 `plans[]`（计划+里程碑）与 `statistics[].planRef` 取代；
   契约单一源在 `plugin-todo-timer/src/contract.ts`（服务名/消息类型/路径/存储键/类型/本地日期键），消费方 import 引用。
   `recordStatistics` 新写入补 `title` 冗余（任务删除后仍可显示）。
3. **新包注册进组合层**：`cli/src/runtime.ts` 的 `DEFAULT_BUNDLES.minimal` + `DEFAULT_PLUGIN_PACKAGES` 加入 `plugin-calendar`（不加不会加载）。
4. **加载顺序**：内核 Fiber 反应式解析已保障（`inject:['todoTimer']` 在服务挂出时自动 load），无需 order 人工干预。
   时区：聚合统一 `localDateKey()`（本地日期），不复刻预览页旧代码 `toISOString()` 的 UTC 错位。

真机验收（headless Chrome + CDP，脚本存 `_artifacts_/verify-calendar-cdp.mjs`、`verify8-cdp.mjs`，截图 `calendar_panel.png`）：
§7 清单 1-8 全部通过（冷启动空态引导 / iframe→桥→node 首屏整包 / 42 格月视图多维徽标与堆叠条 /
老数据（未知任务）兜底 / 本地零点跨天分格且与任务完成同格 / 无刷新实时更新（35→75 分钟）/ tooltip 全中文 /
番茄钟面板零回退）。单测 `plugin-todo-timer/test/service.test.ts` 8/8。`pnpm lint` 通过；
`lint:hardcolor` 存量 16 处违规全部位于预览页自带 `frame.css/shop.css`（上游复制页，非本次改动，未处理）。