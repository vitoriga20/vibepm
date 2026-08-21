# 番茄钟「种植—生长—收获」生长动画 · 对齐方案

> 目标：专注计时期间展示从种子到红番茄的连续生长动画，与计时器同步，形成"种—长—收"闭环。
> 范围：仅方案落盘 + 独立 HTML 演示页。插件真机改造待本方案确认后再动码。
> 状态：颗粒度已与用户对齐，待用户拍板后进实现。

## 读码结论（链路）

计时全在内核 `client/preview/js/clock.js`（`TomatoClock`）：

| 同步点 | 位置 | 用途 |
|---|---|---|
| `clock.config.progress` | `refreshTime()` 实时算 `1 - timeLeft/totalTime`，100ms 刷 | **动画进度源**，working 阶段 0→1 |
| `clock.onTick` | 每读秒一次 | 刷相位 |
| `clock.onStateChange` | idle/working/workPaused/breaking 切换统一回调 | 暂停/重置/收成钩子 |
| `clock.onWorkEnd` | 工作结束 | 成熟动效钩子 |

面板是 `client/components.ts` 的 iframe 整页（`preview/index.html`），生长浮层落在 preview 页内。现有 `pic/tomato_01~09.svg` 是收获序列帧（可复用做＋1 动效），生长是新做。

## 已对齐决策

| 维度 | 拍板 |
|---|---|
| 形态 | 开始专注 → 角落弹出**常驻生长浮层**，专注期随 progress 生长，暂停/继续天然同步，结束/停止收起并显示收成 |
| 视觉 | **线稿几何·冷青**（单色深青 `#147d78`，随 `color.css` 主题变量，契合科研纸感） |
| 渲染 | **CSS + SVG 分层 DOM**，零库零帧循环 |
| 完成反馈 | 番茄＋1 动效（复用 `tomato_01~09`）+ 状态文案沿用现有 + 尝试音效 |
| 失败留痕 | 停止按三阶段判收成，虽枯萎/青果仍短暂展示 |

## 阶段进度（映射 progress 0→1）

| progress | 视觉 | 停止判定 |
|---|---|---|
| 0% | 种子落下 | **<25%** 停止 → 枯萎（不记账） |
| 0–25% | 发芽→幼苗 | |
| 25–75% | 茎长叶展 | **25–99%** 停止 → 青未熟番茄（记**黄**） |
| 75% | 花朵开放 + 小番茄出现（小番茄可持久化） | |
| 75–100% | 番茄长大变红 | **100%** → 成熟番茄（记**红**） |

> 阶段比例按视觉节奏可微调，但总时长恒等于一次专注时长，且进度必须与剩余时间同步（`progress = 1 - timeLeft/totalTime`），非固定速度播放。

## 持久化账目

- 沿用现有 `todoManger_.addTomatoToActiveTask`（按 progress 分红/黄），跨会话保留。
- **改一处记账户面**：现 `index.js` `onWorkEnd` 里 `progress>=0.3` 单一判据 → 改按三阶段：<25% 不记、25–99% 记黄、100% 记红。

## 修改文件清单

1. `client/preview/index.html` — 挂生长浮层容器 + 引新 css/js（浮层挨着 `.todoPill`）
2. `client/preview/js/grow.js`「新增」— 生长控制器：读 progress 映射相位、判收成/枯萎、控制浮层显隐、成熟动效
3. `client/preview/js/floatingWindow.js` — `bindClock()` 补挂：`onTick` 刷相位、`onStateChange` 处理暂停/重置/收成、`onWorkEnd` 成熟动效（不覆盖现有回调）
4. `client/preview/style/`「新增」— 浮层定位、相位显隐、transform、主题变量链 `color.css`
5. `client/preview/pic/`「新增」— 种子/芽/苗/株/花苞/花/青果/红果，线稿几何冷青（可借 `Leaf.png`/`stems.svg`）
6. `client/preview/js/index.js` — 收成记账判据改三阶段（见上）

**不动**：`clock.js` 状态机、存储、通知、休息提醒逻辑。链路改点仅「收成记账判据」一处，其余为纯新增挂载。

## 环境

- 目标宿主：vibepm web（iframe），无桌面。浏览器内核兼容 Chrome/Edge（CSS+SVG 均原生）。
- 本方案演示页为脱离插件的独立 HTML，仅印证视觉与动画节奏。

## 验收标准

- [ ] 开始专注自动弹浮层，计时走到 100% 时正好红果
- [ ] 暂停/继续/停止（<25% 枯萎、25–99% 青果、100% 红果）动画状态正确
- [ ] 红/黄按阶段持久化，重启保留
- [ ] 不干扰计时/通知/休息逻辑
- [ ] 不硬编码：色值/尺寸/文案走单一 token 源，随主题变量
- [ ] `pnpm run build` exit 0 + 真机 `vibepm web` iframe 验证