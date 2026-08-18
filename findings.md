# Findings · dsh 极简重构

> 记录架构发现 / 踩坑 / 已知约束。

## 1. slots 契约（core/src/slots.ts）
- `SlotName` 当前枚举 IDE 式 9 槽：`activity-bar` / `sidebar-panels` / `main-tabs` / `right-panels` / `topbar-menu` / `topbar-right` / `statusbar-left` / `statusbar-right` / `editor-widgets`
- `SlotService.register(slot, item)` 返回 disposer，插件 apply 时收集、dispose 时反向调用
- 快照 `snapshot()` 是 JSON 可序列化 Record<slotName, SlotItem[]>，web-ui 注入 `window.__VIBEPM_SLOTS__`
- `SlotItem.payload` 可以塞任意 JSON，MVP 里塞：`{ targetHash: "#settings" }` 做跳转、`{ api: "/api/settings" }` 等
- **本次新增槽位**：`shell.nav`（首页导航卡片组，MVP 显示「连接 GitHub」「设置」「仓库动态」3 个大卡）、`shell.primary`（主区，放当前路由面板，每个插件通过 slot 注册多个面板，路由按 payload.id 切换）、`shell.secondary`（次区，放状态条或小提示）、`shell.footer`（底栏，版本号 + 连接状态）

## 2. manifest 扫描 + bootGraph（core/src/manifest.ts + client-modules.ts）
- `scanWorkspace(rootHint)` → 扫 `packages/*/package.json` 带 `vibepm.node || vibepm.client` 的才收
- `entryIdFromPkgName("@vibepm/plugin-xxx") === "plugin-xxx"`，用于 `/plugins/<id>/client.js` 路由
- `ClientModuleHost.serve(id, relPathHref)`：relPathHref === `"client.js"` → 用 manifest 的 `clientEntry` 别名直接返回；其他相对路径基于 `clientEntry` 目录解析（有目录穿越保护：`abs.startsWith(clientBase + sep)`）
- `web-ui/src/index.ts` 的路由：`/plugins/<id>/**` → 调 `boot.serve(...)` 返回；Content-Type 按扩展名
- **踩坑**（上次 commit c3762bb 修过）：`<script src>` 默认 classic script，如果入口是 ES module（含顶层 import）→ 浏览器报 `Cannot use import statement outside a module` → **必须 `type="module"`**。本次 shell 里动态 import 用 `import()` 天然 module，HTML 内只加载 shell 本身一个 `<script type=module>`。

## 3. storage 现状（plugin-storage/src/db.ts）
- SQLite 3 表：`projects` / `todos` / `sync_state`
- **缺 settings 表** → 本次扩 `settings(key TEXT PK, value TEXT, updated_at TEXT)`。value 统一存 JSON 字符串，和 dsh 的 config 表格式对齐。
- `DatabaseService` 会加 `getSetting(key): T | null`（内部 JSON.parse）/ `setSetting(key, value)`（JSON.stringify + new Date().toISOString()）/ `listSettings(): Record<string, unknown>`

## 4. Node 侧「插件注册 HTTP 路由」
- `web-ui` apply 时 `createServer` 返回 `http.Server`，把它存进 `WebApp.server`
- `http.Server` 是 `EventEmitter`，可以多次调用 `.on("request", handler)`，先 on 的先执行；只要某个 handler 调用了 `res.end()`，后续 handler 就收不到
- **MVP 约定**：插件 `inject=["webApp"]` → 在 apply 里 `webApp.server.on("request", (req, res) => { if path matches my plugin, handle + res.end })`
- **插件路径命名**：所有 `/api/settings/*`（settings）、`/api/github/*`（github-auth）、`/api/feed/*`（repo-feed），都走这个机制，web-ui 原生 router 只保留 `/` / `/static/*` / `/plugins/*` / `/api/slots` / `/api/boot` / `/api/health`
- **风险**：http.Server 默认 maxListeners 11，插件数量 < 11 没问题；后面多了要 `setMaxListeners(100)`

## 5. Client 侧 shell + 路由 + slot 渲染
- 只有一个 Web Component `vibe-shell`，结构：
  - `header`: 左侧 vibepm 小 logo，右侧（slot=shell.footer 里放 status 放 header 也行，随意）
  - `main.shell-grid`：`section.nav` 渲染 `shell.nav` slot 卡片；`section.primary` 渲染**当前路由匹配到的** `shell.primary` 面板；`section.secondary` 渲染 `shell.secondary`
  - `footer`：渲染 `shell.footer` slot
- 路由：`location.hash` 解析，默认 `#/`（首页显示 onboarding + feed，如果没连接就只显示 onboarding）
- slot 面板路由匹配：每个 `shell.primary` slot item.payload 必须含 `route`（如 `"settings"`, `"auth"`, `"feed"`），hash `#settings` → 取第一个 `payload.route === "settings"` 的面板 render
- Client 侧模块系统（plugin-ide-view/client/module-system.ts）：每个 `factory()` 返回 `{ inject, provide, apply(ctx) }`，`apply` 时传 `ctx.services` / `ctx.slots` / `ctx.boot` / `ctx.events`，和 Node 侧 Context 接口形状对齐，但只读

## 6. 连接 GitHub = PAT 粘贴（MVP）
- dsh 做法：CLI 提示用户创建 PAT，粘贴后写入 `~/.config/dsh/...`
- vibepm 对应：hash `#auth` 页面 → 3 行说明：
  1. Go to https://github.com/settings/tokens?type=beta
  2. Create fine-grained token: Permissions → Repository permissions → Contents: Read-only, Metadata: Read-only, Pull requests: Read-only, Issues: Read-only；Account permissions → Starring: Read-only（可选）
  3. Paste → Save
- 保存走 `POST /api/settings { "github.token": "<token>" }` → DB settings 表。
- 保存成功 → 插件 reload slots（MVP 就刷新页面）

## 7. 仓库动态 feed = 用户事件流（MVP）
- `GET https://api.github.com/users/{username}/received_events/public?per_page=50` 或者 `GET /user/received_events`（需要 token + user scope read:user）
- MVP 简单：token 存了之后调 `GET /user/received_events?per_page=50`，列表项 4 种类型 icon：
  - PushEvent → git 图标 + commit 数
  - PullRequestEvent → pr 图标 + action (opened/closed/merged)
  - IssuesEvent → bug 图标 + action
  - WatchEvent → star 图标（star 了 repo）
- 列表 UI = timeline 条，每条：时间、用户头像、repo 名、事件描述。dsh 的 feed 就这么极简。

## 8. 影响面检查清单（改完再核对）
- [x] `SlotName` 枚举 + SlotService 类型扩了（shell.* 4 槽已加，老 IDE 槽保留 deprecate）
- [x] `plugin-ide-view/src/index.ts` 老 slot 注册全删（极简壳干净）
- [x] `plugin-ide-view/client/components.ts` 只剩 VibeShell
- [x] `plugin-web-ui/static/index.html` 只含 `<vibe-shell>` + 1 个 `type=module` 脚本
- [x] `plugin-storage/src/db.ts` settings 表 CREATE TABLE IF NOT EXISTS（含 getSetting/setSetting/listSettings/deleteSetting）
- [x] 4 新插件 build 后 dist/client/index.js / dist/src/index.js 都在；`pnpm run build` 0 error
- [x] boot 冒烟 8 插件原序装载，无 skip/error

## 9. 阶段 v3 · 生态机制（2026-08-18 落地）
- **patch 行语义**（`core/src/patches.ts`）：`{id,config}` 覆盖整行 config（非 merge）、`{insert:[rows]}` 插入新行、`{disabled:bool}` 禁用/再启用；`parsePatchLayer` 展平 insert；`resolvePluginRows` 多层 base←bundle层←已装层←顶层 层叠；`configLayerToRows` 兼容旧 `Record<id,config>` 覆盖层。
- **manifest 扩**：`vibepm.bundle.patch`（默认 `./vibepm.patch.json`，任务计划写的 `.yml` 是 dsh 参考，vibepm 选 JSON 少依赖）+ `node.schema`/`client.schema`（轻量字段类型校验）；`ResolvedEntry.bundlePatch`。
- **loader v3**：插件组合先由 `buildBootConfig` 经 resolvePluginRows 算出 order/per/disabled；命中 bundle 的 workspace 包按依赖序(Topo)提供 patch 层；schema 校验失败 → 该插件进 `skipped`（插件级隔离，不炸整链）；`pluginsDir()` = `~/.vibepm/plugins`，从 package.json 的 `vibepm.pluginLayers` 自发现已装层并 `mergeEntries` 进 bootGraph（供 `/plugins/<id>/client.js`）。
- **CLI `vibepm plugin`**（`cli/src/cli/plugin.ts`）：薄 pnpm forwarder（首次初始化 pluginsDir + pnpm-workspace.yaml 空 allowBuilds），转发 `pnpm <args>`（相对路径 spec 锚定到调用目录），成功后 `reconcilePlugins` 按已安装态维护 layer 栈（新增 bundle 声明进栈、丢失/未装移除、builder-less 仅告警）。Windows `spawn` 带 `shell`（CVE-2024-27980 硬化）。
- **影响面核对**：`buildBootConfig` 仅 loader 内部 + index 导出，调用方 cli web 只传 config → 无破坏；冷启动 `plugins.enabled` 逻辑保留；内核三件套(PROTECTED_CORE)不可被 patch 禁用；老 `config.plugins` 直列并入 base；老 `config-layer` 覆盖统一 `configLayerToRows` 兼容。
- **风险记录**：insert 的第三方插件若未装到 pluginsDir，loader 会在 import 时 failed → 进 skipped（不 crash）。三轮冒烟验证均绿。
