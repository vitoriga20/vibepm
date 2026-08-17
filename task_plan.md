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
