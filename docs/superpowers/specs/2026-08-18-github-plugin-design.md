# plugin-github 设计文档（项目画像）

日期：2026-08-18
状态：颗粒度已对齐（第 2 轮），待用户 review 后转实现计划

## 1. 背景与动机

现有 GitHub 相关能力分散在两个插件：

- `plugin-github-auth`：手动填 username + Personal Access Token（PAT），存本地 SQLite，暴露 `github` service（me / fetchJson）+ 代理 API。面板 `#auth`。
- `plugin-repo-feed`：拉 `/users/:u/received_events`（关注仓库动态）渲染单条 timeline。面板 `#feed`。

问题：

1. 连接方式繁琐：必须手动填 username + PAT，与本地已登录的 `gh` CLI 无关。
2. 功能定位不匹配：`repo-feed` 用"关注仓库动态"（received_events），本插件真实目的是**管理自己的项目**。
3. 两个插件割裂，能力分散。

## 2. 目标

合并 `plugin-github-auth` + `plugin-repo-feed` 为单一插件 `plugin-github`，升级能力：

- 简化连接：优先自动读取本地 `gh` CLI 已登录 token（零输入）；次选 Device Flow 浏览器授权；手动 PAT 保留作兜底。
- 只读动态：**只展示自己名下仓库的动态**，用于管理自己的项目。
- 动态关注点在 **commits**：能看到每次 push 的 commit 列表与标题（feat 等 subject），**不需要**文件级 diff。
- 仓库列表按提交频率分区：活跃区 + 尘封区（低活跃），帮助聚焦真在维护的项目。
- 明确不做：不做 clone / pull / push 等本地 git 操作，因此**不需要 SSH**，不引入本地 git 执行链路。

## 3. 非目标

- 不做仓库拉取/推送（无 SSH，无 child_process git 操作）。
- 不做关注仓库 / 他人仓库的动态（received_events 移除）。
- 不做 commit 的文件级 diff / 单文件改动详情（只展示 commit subject）。
- 不做 GitHub 通知（notifications）、Issue/PR 交互操作。
- 不做 token 加密存储（延续现状：明文本地 SQLite，本地优先够用原则）。

## 4. 技术约束

- GitHub Events API 硬限制：每端点仅保留最近 90 天、最多 300 条事件，不存在真正"所有"。
- SSH 只能做 git 传输，无法获取 API 数据；动态数据必须走 REST API + token。
- 三个 token 来源与 API 认证完全兼容：Bearer token。

## 5. 架构总览

单一插件 `plugin-github`，沿用项目"两半式插件"模式：

```
packages/plugin-github/
├── src/index.ts          # Node 侧：认证三源 + github service 增强 + API + 面板/导航卡注册
├── client/index.ts       # Client 侧：注册自定义元素
├── client/components.ts  # Client 侧：认证面板 + 仓库列表面板 + 仓库详情面板
├── client/types.d.ts     # 浏览器模块 ambient 声明
├── client-dist/client.js # esbuild 产物（构建生成）
├── dist/                 # tsc 产物（构建生成）
├── package.json          # @vibepm/plugin-github，vibepm 清单
└── tsconfig.json
```

页面结构（3 页，`#feed` 移除）：

| 路由 | 组件 | 说明 |
| --- | --- | --- |
| #auth | github-auth-panel | 连接页；登录后授权表单折叠 |
| #repos | github-repos-panel | 我的仓库（入口默认页）：活跃区 + 尘封区 |
| #repo?name=owner/repo | github-repo-detail-panel | 仓库详情：meta 条 + 动态 timeline（commits 为主） |

替换链路（影响面，7 处，实现时同步修改）：

1. 新建 `packages/plugin-github`（迁移自两个旧插件代码并增强）。
2. `packages/core/src/loader.ts`：bundles minimal 列表中的 `plugin-github-auth`、`plugin-repo-feed` → `plugin-github`。
3. `packages/plugin-plugin-manager/src/index.ts`：插件元数据两条 → 合并一条 `plugin-github`。
4. `packages/plugin-ide-view/client/components.ts`：面板组件 `case "github-auth-panel"` 扩展为认证/列表/详情三组件分发。
5. 删除 `packages/plugin-github-auth`、`packages/plugin-repo-feed` 两目录。
6. workspace / tsconfig reference 更新（移除对两个旧包的依赖与引用）。
7. `plugin-onboarding` 无硬依赖（导航卡自注册），不动。

## 6. 认证三源 + 入口守卫

### 6.1 三源（优先级）

1. **gh CLI 自动读（主，零输入）**：
   - 优先执行 `gh auth token`（若 `gh` 在 PATH），取 stdout。
   - `gh` 未安装 / 失败 → 解析 hosts.yml（Win: `%APPDATA%\GitHub CLI\hosts.yml`；POSIX: `~/.config/gh/hosts.yml`），取 `github.com:` 下 `oauth_token`。
   - 仅读取，不写入不修改 gh 配置。
   - 每次 `/status` 实时解析，gh 已登录即自动 connected（静默自动登录，零交互）。
2. **Device Flow（次，浏览器授权）**：
   - 需要 OAuth App 公开 `client_id`（仅 client_id 参与，client_secret 不参与）。
   - `POST /device/start` → 返回 `device_code` / `user_code` / `verification_uri` / `expires_in` / `interval`。
   - 前端展示授权码 + 链接，按 `interval` 轮询 `POST /device/poll` → 成功存 token；过期/拒绝明确提示可重开。
   - `client_id` 做成配置项，内置默认值，可被覆盖。
3. **手动 PAT（兜底）**：保留 username + PAT 表单，置于最不显眼位置（登录后折叠）。

### 6.2 token 存储与来源标记

- token 存 `github.token`，username 存 `github.username`，来源存 `github.source`（`gh`/`device`/`pat`）。
- 运行时解析顺序：gh CLI 实时读 → 无 gh 回退 settings 中存的手动/device token。
- logout 清 token/username/source + 内存缓存。

### 6.3 入口守卫（强制跳转）

- 进入 `#repos` / `#repo` 前，前端先调 `GET /api/github/status`：
  - connected（含 gh 自动解析）→ 正常渲染。
  - 未连接 → **强制跳转 `#auth`**（不做页内空态引导，避免用户停在无数据的页）。

### 6.4 授权表单折叠

- 已登录后 `#auth` 仅显示状态条（账号 + 来源 + 退出 + 切换），Device Flow / PAT 表单全部折叠隐藏，不重复展示。

## 7. github service 增强

保留 `fetchJson` / `me`，新增：

- `listRepos(): Promise<RepoMeta[]>`：`GET /user/repos?per_page=100&sort=updated` 分页合并全量。
- `repoEvents(owner, repo): Promise<GhEvent[]>`：`GET /repos/:owner/:repo/events?per_page=100`。
- `commitFrequency(events): { commits7d, commits30d }`：从 events 中累加 PushEvent 的 `distinct_size`（去重提交数），分 7 天 / 30 天两档统计。
- 内存 TTL 缓存：repos 与单仓 events 各缓存 `cache_ttl`（默认 60s）；缓存 key 含 token 归属，logout 清空。

## 8. API 设计（统一前缀 /api/github/*）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/github/status | 连接状态 + 来源（gh/device/pat）+ 当前用户 |
| POST | /api/github/login | 手动 PAT 兜底（username + token） |
| POST | /api/github/logout | 清 token/username/source + 清缓存 |
| POST | /api/github/device/start | 发起 Device Flow，返回授权码与链接 |
| POST | /api/github/device/poll | 轮询授权状态，成功返回 token |
| GET | /api/github/repos | 仓库列表 + 提交频率 + 活跃标记（后端聚合） |
| GET | /api/github/repos/:owner/:repo/events | 单仓动态（commits 为主） |

移除旧 `/api/feed`（received_events 单流）与聚合 `/api/github/feed`（聚合逻辑并入 /repos）。

## 9. 动态数据方案

### 9.1 仓库列表聚合（GET /repos 后端完成）

1. `GET /user/repos` 取我的全部仓库（分页合并，按 updated 排序）。
2. 并行拉取每仓 `GET /repos/:owner/:repo/events?per_page=100`，并发上限 5，单仓失败跳过并标记。
3. 从每仓 events 计算提交频率（PushEvent distinct_size 累加）：
   - `commits7d`：近 7 天去重提交数。
   - `commits30d`：近 30 天去重提交数。
4. 分区判据（**待用户确认**）：`commits7d >= 5` → 活跃区；否则 → 尘封区。
5. 返回：`{ ok, repos: [{ ...RepoMeta, commits7d, commits30d, active }], activeCount, dustyCount }`。

> 理解标注：用户给出两个数字"30"与"7天5次"，本设计采用——统计展示窗口 30 天（commits30d），分区判据近 7 天 ≥ 5 次提交（commits7d >= 5）。若两者应统一为同一窗口，请在 review 时指出。

### 9.2 单仓动态（GET /repos/:owner/:repo/events）

- 保留各类型事件：push / PR / issue / release / star / fork / create / watch / other。
- **push 事件展开**：显示"推送 N 个提交"+ 每个 commit 行（subject 即 feat 标题 + 短 sha + 提交者），**不展示文件级 diff**。
- FeedItem 字段：`id / type / icon / actor / title / repo / repo_url / created_at / raw`；push 额外带 `commits: [{ sha_short, subject, author }]`。

## 10. UI

### 10.1 #auth 连接页（改造 github-auth-panel）

- 未登录：状态条（未连接）+ Device Flow 授权块（授权码 + 链接 + 轮询态）+ PAT 兜底表单（折叠）。
- 已登录：状态条（账号 + 来源 + 退出 + 切换），授权表单折叠隐藏。

### 10.2 #repos 仓库列表页（新 github-repos-panel，入口默认页）

- 顶部：连接状态条（已连接：账号 + 来源 + 退出；未连接守卫已强制跳 #auth）+ 仓库总数 + 刷新。
- **活跃区**（标题 + 计数，可折叠）：按 `commits7d` 降序的仓库行。
- **尘封区**（标题 + 计数，**默认折叠**沉底）：低活跃仓库，按 `commits7d` 降序。
- 仓库行字段：名称 + 描述 + 语言色点 + star/fork + "近 30 天提交 N 次" + 最近更新时间 + 打开链接。点行进 `#repo?name=owner/repo`。

### 10.3 #repo?name=owner/repo 仓库详情页（新 github-repo-detail-panel）

- 顶部 meta 条：名称、描述、语言、star/fork、默认分支、html_url 打开链接。
- 动态 timeline：该仓事件，push 展开 commit subject 列表；PR/issue/release 等保留现有图标与相对时间渲染。
- 沿用科研黄黑皮肤 CSS 变量（--skin-* / --yellow），不新增全局样式。

## 11. 配置（vibepm.configSchema）

- `client_id`：Device Flow 用 OAuth App client_id，默认内置值。
- `api_base`：默认 `https://api.github.com`（沿用）。
- `cache_ttl`：内存缓存秒数，默认 60。
- `active_window_days`：活跃判据窗口天数，默认 7。
- `active_min_commits`：活跃判据最少提交数，默认 5。
- `stats_window_days`：提交数展示窗口天数，默认 30。

## 12. 错误处理

- 无任何 token 且 gh CLI 不存在 → `/status` 未连接，前端守卫强制跳 `#auth`。
- gh CLI 存在但未登录 → 落到 Device Flow / PAT。
- 限流（403 / 429）→ 提示 + 优先命中缓存，失败仓库跳过并标记。
- Device Flow 过期/拒绝/超时 → 明确提示，允许重新发起。
- 单仓 events 拉取失败 → 该仓标记失败，其余正常返回。

## 13. 测试（真机验证，验收前必做）

1. 本机已登录 `gh` → 启动 vibepm，进 `#repos` 自动 connected（守卫放行），列表按分区渲染。
2. 模拟无 gh → 进 `#repos` 被强制跳 `#auth` → Device Flow 授权码流程 → 拿 token → 返回列表正常。
3. 手动 PAT 兜底 → 连接 → 列表 + 详情正常。
4. 分区正确性：高活跃仓库在活跃区、低活跃仓库进尘封区且默认折叠；提交数文案正确。
5. 仓库详情：push 事件展开 commit subject 列表，无文件 diff；PR/issue/release 正常。
6. 仓库较多时：并行不超限流、缓存命中、`?refresh=1` 强刷。
7. logout → 凭据与缓存清空 → 守卫重新强制跳 `#auth`。
8. 三处旧痕迹全部消失：`plugin-github-auth`、`plugin-repo-feed` 从 bundles/元数据/面板/路由全部移除，无残留引用。

## 14. 风险与备注

- GitHub Events API 90 天 / 300 条上限：UI 文案需说明"近 30 天提交"，避免"所有"误导。
- Device Flow 需真实 OAuth App client_id：实现时需用户在 GitHub 创建 OAuth App（callback 可任意填写，Device Flow 不回调）。
- 影响面 7 处需一次改全（loader / plugin-manager / ide-view / workspace / tsconfig / 删两包），避免残留引用导致构建或加载失败。
- 分区判据两窗口（统计 30 天 / 判据 7 天）为待确认项，见 §9.1。
- 对外可见内容（README / package.json 描述 / 仓库文档）不出现任何历史借鉴痕迹。
