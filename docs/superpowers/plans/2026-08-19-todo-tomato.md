# TODO番茄钟 · 研究方案 v1

> 目标：把 ZTools 插件 `pomodoro-timer`（超级番茄 v1.0.2）移植成 vibepm 的「TODO番茄钟」业务插件。最大化复用源码，能搬就搬，不自己写重复轮子。
> 状态：研究完成，方案待确认后开工实现。

## 背景

- 上游源码（已拉本地参考，不入 git）：`ztools-plugins-ref/plugins/pomodoro-timer`
- 上游形态：uTools/ZTools 桌面工具插件的纯前端 HTML+JS，多窗口（主页面 + 桌面悬浮窗 + 番茄堆全屏动画 + Tips 弹窗 + 右键菜单）+ Electron IPC。
- 目标宿主 vibepm：类 Cordis 内核 + 两半式插件（node/client）+ shell 槽 + hash 路由的 **web 应用，无桌面窗口系统**。

## 研究结论

### 可整文件搬走（零/近零改动）

| 文件 | 职责 | 存储依赖 |
|---|---|---|
| `todoList.js` | ToDo 管理：TaskList 结构、增删改查、长目标标签、番茄记录、跨天归档、渲染 | `utools.dbStorage`（2 处） |
| `clock.js` | `TomatoClock` 6 态状态机（idle/working/workPaused/breaking/breakPaused），时间戳精度计时，`timeScale` 快进测试 | `utools.dbStorage`（2 处） |
| `settingsConfig.js` | 20+ 可配项（时长/轮数/自动切换/提示音/主题/白噪音/透明度） | `utools.dbStorage` |
| `audioList.js` | 10 条白噪音元数据（含署名） | 无 |
| `calendar.js` | `GitHubCalendar` 纯 DOM 日历热力图 | 无 |
| `audio.js` | `AudioPlayer` 双实例无缝循环 / `AudioManager` | 无 |
| 样式 | `color.css`（亮暗主题变量）、`todoList.css`、`settingPage.css`、`calendar.css`、`frame.css`、`slider.css`、`switch.css`、`select.css`、`audio.css` | — |
| 组件 | `slider.js`、`switch.js`、`select.js`、`drag.js`、`confetti.min.js` | — |
| 资源 | `pic/` 全部 SVG/PNG、`audio/` 13 个 aac、字体文件 | — |

### 必须重写（耦合 utools/Electron/多窗口，vibepm 无桌面窗 → 整体砍掉或降级）

- `floatingWindow.js`（桌面悬浮胶囊）、`tomatoPileWindow.js`（全屏透明窗 + matter-js）、`contextMenuWindow.js`、`tipsWindow.js`
- `preload.js`、`env.js`、`user.js`（utools 环境/用户）
- 全部 `utools.xxx` API 调用点 + `ipcRenderer.sendTo` 多窗通信

### 存储适配

- 上游唯一持久化 API：`utools.dbStorage.getItem/setItem(key, json)`，4 个 key：`settings` / `clock` / `todoList` / `floatingWindow`
- vibepm 侧：抽一个 storage 适配器，走 `settings` 服务（key-value），三个类（todoListManger / TomatoClock / settingsConfig）内部逻辑原样，只换读写调用（共约 6 处）

## 方案设计

### 新插件

```
packages/plugin-todo-timer/
├── package.json              # vibepm.node / vibepm.client / vibepm.bundle 声明（照抄 plugin-settings）
├── vibepm.patch.json         # 把自己 insert 进 bootGraph
├── src/index.ts              # node 半：storage 适配器 + webServer.register('/api/todo-timer') 读写 settings
├── client/index.ts           # client 半：window.__VIBEPM_MODULES__.register + shell.primary(#todo-timer) + shell.nav 卡片
├── client/todoList.js        # 原样搬（存储调用 2 处换适配器）
├── client/clock.js           # 原样搬（存储调用 2 处换适配器）
├── client/settingsConfig.js  # 原样搬（存储调用 2 处换适配器）
├── client/calendar.js        # 原样搬
├── client/audio.js + audioList.js  # 原样搬
├── client/drag.js / slider.js / switch.js / select.js / confetti.min.js  # 原样搬
├── client/style/             # 全搬 color.css / todoList.css / settingPage.css / calendar.css / audio.css / frame.css 等
└── client/static/            # 全搬 pic/ audio/ 字体
```

### 页面切分

上游单页 5 子页（时钟/统计/白噪音/设置/账号）→ vibepm 内 `#todo-timer` 面板内 4 个子视图：

1. 时钟 + 任务列表（核心：todoList + clock UI）
2. 统计日历 + 长目标（calendar.js + 统计方法）
3. 白噪音（audioList + audio）
4. 设置（settingsConfig + slider/switch/select）

账号页砍掉（依赖 `utools.getUser`）。

### 桌面浮层决策（用户已拍板）

- **暂时做页面内浮层**：计时器状态机收进插件上下文，页面内做迷你胶囊显示倒计时；完成提示用页面内浮层 + 提示音（HTML5 Audio 直接搬）。
- **桌面常驻功能预留位置**：代码层面预留浮层抽象（如 `FloatingSurface` 接口 + 事件广播点），将来 vibepm 若引入桌面壳可接入。不做 Electron IPC，不写死桌面 API。

### 已知上游 bug（移植时一并修）

1. `statisticsTodayNum` 里 `focusHours = totalFocusTime/6000` 口径错（应为毫秒转小时，对齐 `getWorkStatistics` 的 `/3600000`）
2. `calendar.js` tooltip `/36000000` 多一个 0
3. `switchPage(5)` 指向不存在账号页 → 越界（页面切分后天然消除）
4. `todoList.js` `lastActiveTask` 未初始化赋值（首帧误触发判断）
5. `timeScale` 在 index 与 floatingWindow 各自定义一份 → 收进单例配置

## 影响面 / 风险

- 新插件独立目录，不动现有 11 插件；`manifest.scanWorkspace` 自动发现 `packages/*` 下带 `vibepm` 字段的包 → 只需加目录 + tsconfig references
- `vibepm.patch.json` 的 `id` 必须与 node 半 `name` 一致，否则 shell 丢渲染
- 番茄堆 matter-js 全屏动画本轮不做（依赖桌面透明窗），作为将来可选增强
- 白噪音/音效资源含 CC0/署名协议，保留 `attribution` 字段合规

## 验收标准

- [ ] `pnpm run build` exit 0
- [ ] 真机 `vibepm web`：shell.nav 出现「TODO番茄钟」卡片；`#todo-timer` 面板渲染 4 子页
- [ ] ToDo 增删改查 / 完成 / 长目标标签 / 番茄计数持久化（重启后保留）
- [ ] 番茄钟工作/短休/长休/暂停状态机正常，`timeScale` 快进可测
- [ ] 配置项（时长/轮数/主题/白噪音）读写生效
- [ ] 页面内浮层 + 提示音生效；桌面常驻位置已预留
- [ ] 每验收一 git commit；对外文档不提参考来源

## 参考

- 上游源码（本地只读参考，不入 git）：`ztools-plugins-ref/plugins/pomodoro-timer`
- vibepm 照抄模板：`packages/plugin-settings` / `packages/plugin-onboarding` / `examples/plugin-hello`
