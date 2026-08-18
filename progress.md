# Progress · 会话日志

## 2026-08-17 会话 1（紧接 c3762bb）
- 用户需求：界面像 dsh 一样极简，仅保留「设置 / 连接 GitHub / 仓库动态」3 核心功能，全部插件化。
- Todo1 done：读完 core/slots + manifest + client-modules + storage DB schema + web-ui router + ide-view 50+ slot 注册 + 6 个 WC 组件。
- Todo2 in_progress：写 task_plan.md（11 步） + findings.md（8 大发现 + 影响面清单） + progress.md。
- 已知上轮 commit：`c3762bb fix(ui): 去掉丑陋 loading 动画 + 修复一直在加载根因`；`https://github.com/vitoriga20/vibepm/tree/main`

## 2026-08-18 会话 2（执行 task_plan）
- 阶段 v2 已随上一批 commit 完成（slots shell.* + 极简壳 + 4 核心插件 + settings 表）；基线 `pnpm run build` exit 0。
- 阶段 v3（生态机制对齐 dsh）全部落地：
  - `core/src/patches.ts`：parsePatchLayer + resolvePluginRows（覆盖/insert/disabled/config整体替换）+ configLayerToRows 兼容旧覆盖层
  - `core/src/schema.ts`：validatePluginConfig 轻量校验；`core/test/patches.test.ts` 8 断言全过
  - `core/src/manifest.ts`：VibePmManifest 增 `bundle`、node/client 增 `schema`，ResolvedEntry 增 `bundlePatch`
  - `core/src/loader.ts`：base(builtin bundles) ← workspace bundle 层(依赖序) ← 已安装插件层(pluginsDir) ← 顶层 patch；schema 校验失败 → 插件进 skipped；bootGraph mergeEntries 并入已安装插件
  - `core/src/config.ts`：新增 pluginsDir()（~/.vibepm/plugins）
  - `cli/src/cli/plugin.ts`：`vibepm plugin <pnpm args...>` forwarder + reconcilePlugins（按已安装态维护 vibepm.pluginLayers）；注册进 commander
- 验证：全 workspace build exit 0；boot 冒烟 8 插件原序装载无 skip/error；buildBootConfig patch 层覆盖/禁用/插入/顺序全对；CLI help 正常。
- 待办：commit + push；README 提及 `vibepm plugin` 安装三方插件。

## 2026-08-18 会话 3（解耦方案对齐 + 落盘，未改代码）
- 用户要求框架与插件解耦，先给方案对齐颗粒度；答复「dsh 怎么样我们就怎么样」，先落盘不改代码。
- 完成源码级耦合盘点：core 硬编码插件 id（DEFAULT_BUNDLES / PROTECTED_CORE / LEGACY 死代码）、slots 9 旧槽、config 业务段、web-ui 路由写业务 API + `/*__BOOT__*/` 替换、module-system 住在 ide-view 且 6 插件 import 其 URL、VibeShell switch 硬编码 panel、CLI 正则认错误、plugin-manager 硬编码目录。
- 研读 dsh 参考源码确认对齐模型：webServer 哑载体（register / registerFallback / tapIndex）、frontend-static 占兜底座位、client-modules 双面插件（tapIndex 注入 + 内核构造 `__DSH_MODULES__`）、shell = 前端 dist + ui-* client 插件行、plugin-inventory 动态投影、profile/bundle 数据驱动组合。
- 产出 5 阶段解耦计划（P1 core 去插件知识 → P2 webServer 化+业务 API 迁移 → P3 client 模块系统上移 → P4 shell 面板数据驱动 → P5 CLI 结构化+plugin-manager 动态化），落盘 task_plan.md「阶段 v4」。
- 待办：用户确认后从 P1 开干；每阶段 build + 真机验证 + git commit。

## 2026-08-19 会话 4（P1-P5 解耦全部落地 + 子智能体真机检验）
- 执行 task_plan 阶段 v4 全部 5 阶段，每阶段 build + 冒烟 + 独立 commit：
  - P1 `6bc0c09`：DEFAULT_BUNDLES / PROTECTED_CORE / LEGACY_ENTRY_DIR 移出 core → cli/runtime.ts，boot 前注入 config.vibepm.runtime；defaultProfile 减通用（业务默认进 storage/web-ui 插件）；slots 删 9 旧槽只留 shell.*
  - P2 `3787c89`：web-ui 拆 webServer 哑载体（register/registerFallback/tapIndex，对齐 dsh-host-webserver）；业务 API 全迁所属插件（projects/todos/sync→storage、github→github-auth、settings、feed、plugins）；web-api/route bail 事件退役；Context 增 removeUpdate
  - P3 `b2dcf0f`：7 个 client 插件改用 window.__VIBEPM_MODULES__，删 /plugins/plugin-ide-view/module-system.js URL import + esbuild external + types.d.ts；module-system normSlots 只留 shell.*
  - P4 `f1332d0`：RenderRegistry（kind→标签名，插件 apply 自注册）；VibeShell 删 renderPrimary switch / iconFor / selfId 硬编码，改查表渲染；shell.primary 加 icon 数据驱动
  - P5 `12a5fa3`：core 增 BootError(code)；PortBusyError 继承之（web.listen_failed）；CLI fatal 判定改按 code（去 /web-ui|端口|EADDRINUSE/ 正则）；plugin-manager 删 PLUGIN_META，目录从 id 派生 + 自声明 description 动态生成
- 子智能体真机检验：
  - 静态/构建子智能体：build exit 0、core 8 测试全过、8 项静态解耦检查全 PASS（core 无插件 id、web-ui 无业务 API、无壳 URL import、无 switch、CLI 无正则、无 PLUGIN_META、slots 只 shell.*、RenderRegistry 存在）
  - 浏览器 E2E 子智能体（隔离临时 db）：首页/设置/连接/动态/插件管理五路由全渲染；11 插件动态目录；API 全绿；皮肤开启后重启生效（深色 #111316/#ffd84d）；ambient 禁用后重启从 bootGraph 整体剔除（无画布无资源）
  - 发现并修复 plugin-ambient 背景画布 bug：`grad.addColorStop(0.35, GRID_MAJOR)` 缺 rgb() 包装导致 addColorStop 解析失败 → 改为 `rgb(${GRID_MAJOR})`，重建 + 浏览器复验无新增报错
- 待办：commit ambient 修复；README/对外文档不提及 dsh。
