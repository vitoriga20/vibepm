# vibepm · 阶段计划 v2（对齐 dsh 极简 + 全插件化）

> 目标：像 dsh 一样，初始界面极简，只保留核心功能 3 件：**设置**、**连接 GitHub**、**仓库动态**。每一块都做成独立插件，UI 壳 (plugin-ide-view) 只保留最小容器 + 路由 + slots 挂载，不内嵌任何功能面板。

## 里程碑总览
- **阶段 1 规划**（当前阶段）: 读架构 + 写 task_plan / findings / progress ← **in_progress**
- **阶段 2 底座改造**：
  - 简化 `plugin-ide-view`：删 6 个 IDE 组件 → 换成 1 个 `vibe-shell` WC（卡片容器 + 路由 + 4 个通用 slot 挂载点）
  - 简化 `index.html`：只放 `<vibe-shell></vibe-shell>`，删 IDE 式分栏标签
  - 简化 `shell.css`：删 IDE 工作台样式，保留主题 tokens + 卡片/表单基础样式
  - 扩 `SlotName`：新增 `shell.nav`（首页导航卡） / `shell.primary`（主面板） / `shell.secondary`（次面板） / `shell.footer`（底栏）
- **阶段 3 storage 补齐**: 新增 settings 表（key-value JSON，存 GitHub token、用户偏好…），`plugin-storage` 扩 settings 读写 API
- **阶段 4 4 个新插件**:
  1. `plugin-onboarding`（Node + Client）：无 settings.token 时向 `shell.nav` / `shell.primary` 注册「欢迎 + 连接 GitHub + 打开设置」3 张卡
  2. `plugin-settings`（Node + Client + `/api/settings`）：设置表单 → 读写 settings 表，向 `shell.primary` 注册 settings 面板路由
  3. `plugin-github-auth`（Node + Client + `/api/github/auth/*`）：OAuth 设备码或 PAT 两种握手方式，token 存 settings，提供 `github` service（rest 客户端），向 `shell.nav` 注册「已连接 / 连接中 / 失败」状态卡
  4. `plugin-repo-feed`（Node + Client + `/api/feed`）：拿 `github` service → 拉 watched repos 的事件流（WatchEvent / PushEvent / PullRequestEvent / IssuesEvent），向 `shell.primary` 注册 feed 面板
- **阶段 5 构建链路**: 新 4 插件加入 `packages/*`，pnpm-workspace（已天然 `packages/*` 全包），根/包内 tsconfig 补 references，`vibepm` 字段 manifest 完整
- **阶段 6 验证**: Playwright 无头过断言 → build 无错 → commit + push

## 阶段 2-6 详细步骤
| 步骤 | 产出 | 依赖 | 风险点 |
|------|------|------|--------|
| 2.1 | 改 `core/src/slots.ts` SlotName 枚举（扩通用 shell.* 4 槽，老 activity-bar/sidebar 先保留，deprecate） | 无 | 老插件仍写老槽 → ide-view 不再渲染 → UI 丢失 → 阶段 2.5 同步把老 ide-view 里写老槽的注册删掉 |
| 2.2 | 重写 `plugin-ide-view/client/components.ts` → 只剩 `VibeShell` 1 个 WC | 2.1 | client-side 路由极简 hash 实现（#settings / #feed / #auth） |
| 2.3 | 改 `plugin-ide-view/client/icons.ts` → 只保 `settings`/`github`/`feed`/`logo` 4 图标 | 无 | 老 icon 名残留 → 直接保留原文件不删（懒，怕引用），components.ts 里删掉老 VibeTopbar/ActivityBar |
| 2.4 | 删 `plugin-ide-view/src/index.ts` 里所有 IDE 风格 slots 注册；ide-view Node 半只做一件事：给 bootGraph 标记自己是 UI shell 插件 | 2.1 | 现在 web-ui 注入 slots 快照为空也没问题（client-side fallback） |
| 2.5 | 改 `plugin-web-ui/static/index.html` 成极简壳 | 2.2 | 新 4 插件的 client.js 要在 HTML 里用 `<script type=module src=/plugins/<id>/client.js>` —— web-ui 注入 `__BOOT__` 已有 entries 列表，让 shell 动态拉；index.html 不要硬写任何插件 URL，只写 `<script type=module src=/plugins/plugin-ide-view/client.js>`（shell），shell 再按 bootGraph 动态懒加载其他 client |
| 2.6 | 删 shell.css IDE 布局 CSS，留 40 行以内 token + 基础卡片 | 2.5 | |
| 3.1 | `plugin-storage/src/db.ts` 新增 `settings` 表（key TEXT PK / value TEXT / updated_at TEXT），Database 增 getSetting/setSetting/listSettings | 无 | 老 db 没这张表 → Database 构造器里 `CREATE TABLE IF NOT EXISTS` 天然兼容 |
| 3.2 | `plugin-storage/src/index.ts` DatabaseService 包装 3 个新方法 | 3.1 | |
| 4.1 | 生成 `plugin-onboarding` Node + Client 目录结构 | 3.2 done | |
| 4.2 | 生成 `plugin-settings` Node + Client + `/api/settings GET/POST` | 3.2, web-ui 路由通用 | |
| 4.3 | 生成 `plugin-github-auth` Node + Client + OAuth 设备码握手（避免 GitHub App 配置复杂度），写 settings `github.token`，提供 `github` 服务封装 Octokit-free fetch | 3.2 | 设备码 flow 需要 `/login/device/code` + `/login/oauth/access_token` 公开端点 → 不需要 Client ID？不对，需要 Client ID，但可以让用户在设置里填 —— MVP 退化成 PAT 输入框（用户自己到 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained token，scope: repo + notifications），更简单对齐 dsh 的「输入 token → 连接」 |
| 4.4 | 生成 `plugin-repo-feed` Node + Client，读 `github.token` → `GET /user/repos?per_page=100` 拿 1 页 + `/user/received_events?per_page=50` 做 feed（MVP，分页后续加） | 4.3 | |
| 5.1 | 4 新插件每个：package.json（`name: "@vibepm/plugin-xxx"`、`vibepm.node.inject` / `vibepm.client.entry`、scripts、deps `@vibepm/core`、`@vibepm/plugin-storage` 如果 inject db）、tsconfig.json（references 到 core、storage）、client/index.ts | 无 | manifest.scanWorkspace 扫 packages/* 下所有带 vibepm 字段的 package.json，不用手动加；但要注意 `tsconfig.base.json` 无 references 字段（当前 composite 项目靠每个包自己的 tsconfig references） |
| 5.2 | 根 `pnpm install` → 生成 workspace symlinks → `pnpm run build` 看全链路 | 5.1 | |
| 6.1 | Playwright 验证：首屏 `#app` 下有 `vibe-shell`；无 settings 时显示 onboarding 3 卡；点 settings 路由到设置表单（hash `#settings`）；点 GitHub 连接跳输入 token 表单（hash `#auth`）；保存 token 后出现 feed 面板入口 | 5.2 | |
| 6.2 | commit + push | 6.1 | |

## 决策与取舍
- **dsh 风格是什么？** = 功能最少化、插件边界清晰、不做 IDE 式工作区、首屏「你没配置 → 提示去配置 + 连接」→ 有了 token → 主卡是 feed，设置在侧栏
- **MVP 为什么用 PAT 不用 OAuth Device Code？** = PAT 不需要 client-id / app 注册；用户直接从 GitHub 拿 token 粘贴，对齐 dsh 最常见的 CLI 连接方式。等插件生态起来再加 OAuth Device。
- **路由 = hash 历史**（`#settings`, `#auth`, `#feed`）= 不需要服务端 404 回退，静态壳无刷新跳转，dsh 的前端路由也这么做。
- **SlotName 保留老槽位**（activity-bar / sidebar / ...）= 怕后面有残留插件用，但 ide-view 不再渲染它们 → 没副作用；如果 build 不报错就留着。

## 风险 → 前置检查
1. **4 新插件的 dist/client/index.js 存在吗？** → build 后要验证 `boot.serve("plugin-onboarding", "client.js") !== null`
2. **`/api/settings` 和 `/api/feed` 路由在哪？** → 现在 web-ui router 里硬编码老 API。方案一：每个插件 inject `webApp` 给 server 加路由？但 `webApp` 是 `http.Server`，没注册中间件机制。方案二（MVP）：web-ui router 里改成「Node 侧事件」模式 → `ctx.events.emit("web-ui:register-route", {method, path, handler})`，router 里收集后匹配。方案三（更简单，先这么干）：在 web-ui 里按约定路径检查 `ctx.has('settingsApi')` 之类 → 不行，硬耦合。**最终方案：插件自己在 apply 里监听 server `request` 事件**（http.Server 是 EventEmitter，先注册的 handler 先拿 req，可以调用 `res.end` 处理掉；不处理就下一个 web-ui router 处理）。轻、对齐 Cordis 的 lifecycle。等后续再抽象出 `httpRoute` 服务。
3. **Client 侧懒加载**：index.html 里只硬加载 `plugin-ide-view/client.js`（shell），shell 里再遍历 `__VIBEPM_BOOT__.entries` 动态 `import(entry.url)` 注册其他 client 模块 → 对齐 dsh bootGraph 思想，不用在 HTML 里手加 N 个 `<script>`。

## 完成判定
- [ ] Playwright：首屏 `<vibe-shell>` 存在，onboarding 3 卡片出现；
- [ ] Playwright：`#settings` 路由 → settings 面板，保存后刷新页面 settings 值回填；
- [ ] Playwright：`#auth` 路由 → 填 PAT 保存 → settings 里 `github.token` 有值，onboarding 消失 → feed 面板入口出现；
- [ ] 全链路 `pnpm run build` exit 0；
- [ ] 新 4 插件 `package.json` 都有 `vibepm.node` / `vibepm.client`（或二选一，按需）；
- [ ] 无 console error，无 boot-error 横幅。

---

# 阶段 v3 · 生态机制对齐 dsh（A 层 · 只对齐生态机制）

> 决策：跟 dsh 生态完全对齐，但只对齐「生态机制」，不堆 harness 重机制（HMR / preset / per-session cordis.yml / headless+web 双 profile 不做）。
> 目标：第三方插件 = npm 包 + `vibepm.bundle.patch` 声明 → 可用 `vibepm plugin <pkg>` 安装 → 按依赖顺序层叠进组合。业务插件全部自研。

## 现状盘点（v3 对齐前已有什么 / 缺什么）

已具备（可复用，不动）：
- `buildBootConfig(config, patchLayers, bundles, directPlugins)`：已有 patchLayers 维度，但语义 = **按 entryId 覆盖 config**，不是按行插入/删行
- `scanWorkspace` + `ResolvedEntry`：扫 `vibepm.node` / `vibepm.client`
- `DEFAULT_BUNDLES[minimal]`：硬编码 plugin 名单
- CLI `applyPatch / ensureProfile / saveProfile / profilePath / loadProfile / defaultProfile`（core 已导出）
- 冷启动 `plugins.enabled`（plugin-plugin-manager 可关插件，等价 dsh profile user-layer patch 思想）

缺（本次要建）：
1. 插件 package.json 的 **`vibepm.bundle.patch` 字段**未解析（manifest.ts 只读 node/client）
2. **patch 文件行语义**：dsh 是 `- id:` / `- insert:` / `- disabled:` 的行列表，按 id 覆盖且可插入新行；现 patchLayers 只是 config 覆盖，不能 insert
3. **`vibepm plugin <pkg>` 命令**（pnpm forwarder + 装后 reconcile）不存在
4. **schema 校验**不存在（先手写 validate，不引 schemastery）

## 步骤

### 3.1 manifest 解析 `vibepm.bundle`
- 扩展 `packages/core/src/manifest.ts`：`VibePmManifest` 加 `bundle?: { patch?: string }`
- `scanWorkspace` 时解析 `pkg.vibepm.bundle.patch`（相对包根的 patch 文件路径，默认 `./vibepm.patch.yml`），存进 `ResolvedEntry`（新增 `bundlePatch: string | null`）
- 对齐 dsh：`"vibepm": { "bundle": { "patch": "./vibepm.patch.yml" } }` 的包 = 可安装组合层插件

### 3.2 patch 文件格式 + 层叠语义（核心）
- 定义 patch 行格式（对齐 dsh cordis.patch.yml 思想，用 JSON/YAML 均可，先 JSON 少依赖）：
  - 覆盖已有行：`{ id: "plugin-settings", config: {...} }`
  - 插入新行：`{ insert: { id: "my-plugin", name: "@my/pkg", config: {...} } }`
  - 禁用：`{ id: "plugin-repo-feed", disabled: true }`
- 新增 `packages/core/src/patches.ts`：
  - `parsePatchLayer(raw): PatchRow[]`
  - `resolvePluginRows(layers): { order, per }` —— 按「base 行 ← 各 bundle 按 dependency 顺序 ← profile 覆盖 ← CLI --patch」层叠：
    - 逐层应用，`id` 相同 → 覆盖该行（config 整体替换，对齐 dsh「patch 替换整行 config」）
    - `insert` → 追加新行
    - `disabled: true` → 标记跳过
- `loader.ts` 的 `buildBootConfig` 改走 `resolvePluginRows`；`DEFAULT_BUNDLES[minimal]` → 改为 base patch 层文件（谁提供？见 3.4）

### 3.3 CLI `vibepm plugin` 子命令
- 新增 `packages/cli/src/cli/plugin.ts`（照搬 dsh `apps/cli/src/plugin.ts` 逻辑）：
  - `vibepm plugin <profile?> <pnpm args...>` → 确保 profile 目录 + 初始化 base → `spawnSync('pnpm', args, { cwd: profileDir, stdio:'inherit', shell: win32 })` → 成功后 `reconcilePlugins`
  - `reconcilePlugins`：扫已装依赖，发现声明 `vibepm.bundle.patch` 的加入 layer 栈；丢失该声明的移除；无 bundle 声明的普通依赖给 warning
  - 注册进 `bin.ts` / commander（对齐现有 web/setup/sync/status 样式）
- Windows：命令分隔用 `;`；`spawn` pnpm 需 `shell`（CVE-2024-27980 硬化）

### 3.4 现有 7 插件迁成 patch 形式
- 为 system 内置插件建 base patch（放 `packages/core` 或用 config 默认）：`minimal` 名单 → 一行一行的 patch row，含当前 `DEFAULT_BUNDLES[minimal]` 全部 8 个插件
- 每个插件 package.json 若需被第三方覆盖 → 确认 `id` 稳定（`entryIdFromPkgName` 结果），无 `vibepm.bundle` 声明的内置插件仍属 base，不出现在可安装层

### 3.5 schema 校验
- `packages/core/src/schema.ts`：手写轻量 `validatePluginConfig(id, config, schema)`，每个插件 `package.json` `vibepm.node` 旁可选 `schema` 字段（字段名/类型/必填）
- loader 装入时校验，失败 → 插件进 `skipped` 并带清晰报错（不 crash 整链，对齐 dsh fail-loud 但插件级隔离）

## 影响面检查清单
- [ ] patch 行语义改动后：`buildBootConfig` 老 `patchLayers`（config 覆盖）调用方是否兼容或统一迁到新层叠
- [ ] `DEFAULT_BUNDLES` 迁 patch 后：`plugin-plugin-manager` 冷启动 enabled 读取序是否仍可用（db 最先加载不变）
- [ ] 每个 patch 行 `id` 与 `entryIdFromPkgName` 输出严格一致，否则面板丢渲染
- [ ] `vibepm plugin` 子命令不破坏现有 web/setup/sync/status
- [ ] schema 校验失败只跳过该插件，不炸整链
- [ ] `pnpm run build` + Playwright 全过；对外（README/npm 描述/注释）不提 dsh
- [ ] 完成一次 git commit（每验收一提交，便于回滚）

---

# 阶段 v4 · 框架与插件解耦（对齐 dsh 分层）

> 决策：dsh 怎么拆，我们就怎么拆。全部对齐 dsh 参考源码（deepseek-harness-master）的分层模型。
> 目标：`@vibepm/core` 纯内核不认任何插件 id；webServer 变哑载体（业务 API 归各插件）；client 模块系统上移、插件不再 import 壳 URL；shell 面板渲染数据驱动；CLI 只认结构化错误；plugin-manager 目录动态生成。
> 状态：方案已与用户对齐（「dsh 怎么样我们就怎么样」），本阶段只落盘计划，P1 起才改代码。

## 现状耦合盘点（已源码级核实）

| 位置 | 耦合点 |
|---|---|
| `core/src/loader.ts` | `DEFAULT_BUNDLES` 硬编码 9 内置插件、`PROTECTED_CORE` 硬编码 3（storage/web-ui/ide-view）、`LEGACY_ENTRY_DIR` 死代码（vibepm-ts 已无 `src/`） |
| `core/src/slots.ts` | `SlotName` 硬编码 4 个 `shell.*` + 9 个旧 IDE 槽位（无人注册） |
| `core/src/config.ts` | `defaultProfile()` 硬编码 github/storage/web_ui 业务段 |
| `core/src/client-modules.ts` | 注释把浏览器模块系统实现指向 plugin-ide-view |
| `plugin-web-ui/src/index.ts` | 路由写业务 API（`/api/projects` `/api/todos` `/api/sync` `/field`），直连 `db` / `repoStore` / `config.github` |
| `plugin-web-ui/static/index.html` | `/*__BOOT__*/` 模板替换 + 硬编码 `/plugins/plugin-ide-view/client.js` |
| `plugin-ide-view/client/components.ts` | `renderPrimary` switch 硬编码 panel kind→element（github-auth-panel/settings-panel/feed-panel/plugin-manager-panel）；`iconFor` 硬编码 route；`asciiBanner` 硬编码排除自身 id |
| `plugin-ide-view/client/module-system.ts` | 框架级浏览器模块系统住在插件里；6 个 client 插件 `import /plugins/plugin-ide-view/module-system.js`；`normSlots` 硬编码 9 旧槽 |
| `cli/src/cli/commands.ts` | `web()` 正则 `/web-ui\|端口\|EADDRINUSE/` 认错误；查 `ctx.has("webUrl")` 认插件 |
| `plugin-plugin-manager/src/index.ts` | 硬编码 10 插件 display/desc 目录（未从 manifest 动态生成） |

## dsh 对齐目标（分层）

```
浏览器端
┌ 前端 dist（壳内核，static 兜底托管）──────────┐
│ index.html 只留 <vibe-shell> + 内核 script  │
│ module-system（构造 window.__VIBEPM_MODULES__）│ ← 从 ide-view 上移
│ VibeShell（布局/导航/面板查 registry 渲染）    │ ← ide-view 变 app，不再插件行
│ panel registry（kind→element，插件自注册）    │
└───────────────┬────────────────────────────┘
  动态 import bootGraph（tapIndex 注入 __VIBEPM_BOOT__）
┌ client 插件层（vibepm.client 行）──────────────┐
│ onboarding/settings/github-auth/feed/       │
│ plugin-manager/ambient/skin-rhine           │ ← 用 window.__VIBEPM_MODULES__
└───────────────┬────────────────────────────┘

Node 端
┌ 运行时 vibepm CLI（profile/bundle 组合）────────┐
│ bundles 默认集（原 DEFAULT_BUNDLES 迁这）       │
│ 结构化 boot 错误码 + 端口                        │
└───────────────┬────────────────────────────┘
┌ 框架层 @vibepm/core（纯内核，零插件 id）─────────┐
│ ctx/eventbus/service/loader/manifest/patch    │
│ slots（只 shell.*）                            │
│ client-modules（双面：Node 半扫 roster + serve │
│   /plugins + tapIndex 注入；浏览器半=内核）      │
│ webServer（register/registerFallback/        │
│   tapIndex，哑载体，无业务）                    │
└──────┬──────────────┬────────────────────────┘
       │register 路由  │register 路由
┌ 系统壳插件 ────────┐ ┌ 业务插件 ──────────────┐
│ storage(db)        │ │ github-auth/settings │
│ static 兜底        │ │ repo-feed/onboarding │
│ (web-ui 拆)        │ │ plugin-manager       │
└────────────────────┘ └──────────────────────┘
```

## 步骤（P1-P5，每阶段 build + 真机验证 + 一提交）

### P1 · core 去插件知识
- `DEFAULT_BUNDLES` / `PROTECTED_CORE` / `LEGACY_ENTRY_DIR` 移出 core → 运行时/CLI 层（bundle 定义注入 loader 的 `bundles` 参数，loader 已有该维度）
- `defaultProfile()` 减到通用；github/storage/web_ui 业务默认值进各插件 config schema
- `slots.ts` 删 9 旧 IDE 槽位，只留 `shell.*`
- 影响面：loader / core/index / plugin-plugin-manager（读 PROTECTED_CORE）/ cli
- 验收：core 无 `plugin-xxx` 字面量；`pnpm run build` exit 0；`vibepm web` 照常起

### P2 · webServer 化 + 业务 API 迁移
- web-ui 拆 `webServer` 服务：`register(route)`（exact/prefix 命名路由）/ `registerFallback`（唯一兜底座位）/ `tapIndex`（纯 html 变换），对齐 dsh-host-webserver
- `/api/projects` `/api/todos` `/api/sync` `/field` 迁到 storage / repo-feed 插件自注册路由
- 影响面：全部业务插件（github/settings/repo-feed/onboarding 都注册 API）+ client fetch 路径
- 验收：全部 `/api/*` 真机可用（curl + 浏览器）

### P3 · client 模块系统上移 + tapIndex 注入
- module-system 浏览器半挪 core/modules；壳内核构造 `window.__VIBEPM_MODULES__`
- 6 个 client 插件改 `window.__VIBEPM_MODULES__.register`，删 `/plugins/plugin-ide-view/module-system.js` import
- boot/slots 注入改 `tapIndex`，index.html 只留 `<vibe-shell>` + 内核 script
- 影响面：全部 client 插件、web-ui、ide-view
- 验收：浏览器全插件加载 / 皮肤开关 / 禁用逻辑无回归

### P4 · shell 面板数据驱动
- client 侧 panel registry（kind→element，面板插件自注册）
- VibeShell 删 switch + 硬编码 route/self-id/文案
- 影响面：ide-view + 4 面板插件（github/settings/feed/plugin-manager）
- 验收：新面板插件不碰壳即可加面板；旧面板无回归

### P5 · CLI 结构化 + plugin-manager 动态化
- CLI 认结构化 boot 错误码，不按插件名正则；bundle 默认集走运行时
- plugin-manager 目录从 `enumerateAllEntries` 动态生成（对齐 dsh-host-plugin-inventory）
- 影响面：cli / plugin-plugin-manager
- 验收：插件列表动态；disable 逻辑照常

## 待确认的设计点
- ide-view 壳身份转 app dist（vibe-shell / module-system / icons / boot 编排整体移到 static 兜底托管），对齐 dsh「前端 dist = 内核、ui-* 全是 client 插件行」。P3/P4 落地前与用户确认。

## 影响面检查清单
- [ ] core 去插件 id 后：`plugin-plugin-manager` 冷启动 `plugins.enabled` 读取序不变（db 最先加载）
- [ ] webServer 化后：`web-api/route` bail 事件与命名路由二者取舍（保留 bail 或改 register，任选其一，链路统一）
- [ ] client 模块系统上移后：禁用插件（`excludeMany`）仍能从 client bootGraph 剔除，皮肤/装饰不残留
- [ ] shell 面板数据驱动后：旧 `kind` 值（github-auth-panel 等）迁移到 registry 注册，避免面板丢渲染
- [ ] `pnpm run build` + 真机浏览器全过；对外（README/npm 描述/注释）不提 dsh
- [ ] 每阶段完成一次 git commit（每验收一提交，便于回滚）
