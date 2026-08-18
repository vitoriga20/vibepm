# plugin-github 设计文档（项目画像）

日期：2026-08-18
状态：已与用户对齐颗粒度，待用户 review 后转实现计划

## 1. 背景与动机

现有 GitHub 相关能力分散在两个插件：

- `plugin-github-auth`：手动填 username + Personal Access Token（PAT），存本地 SQLite，暴露 `github` service（me / fetchJson）+ 代理 API。面板 `#auth`。
- `plugin-repo-feed`：拉 `/users/:u/received_events`（关注仓库动态）渲染单条 timeline。面板 `#feed`。

问题：

1. 连接方式繁琐：必须手动填 username + PAT，与本地已登录的 `gh` CLI 无关。
2. 功能定位不匹配：`repo-feed` 用的是"关注仓库动态"（received_events），而本插件的真实目的是**管理自己的项目**。
3. 两个插件割裂，能力分散。

## 2. 目标

合并 `plugin-github-auth` + `plugin-repo-feed` 为单一插件 `plugin-github`，并升级能力：

- 简化连接：优先自动读取本地 `gh` CLI 已登录 token（零输入）；次选 Device Flow 浏览器授权；手动 PAT 保留作兜底。
- 只读动态：**只展示自己名下仓库的动态**，按仓库分组。用于管理自己的项目。
- 明确不做：不做 clone / pull / push 等本地 git 操作，因此**不需要 SSH**，不引入本地 git 执行链路。

## 3. 非目标

- 不做仓库拉取/推送（无 SSH，无 child_process git 操作）。
- 不做关注仓库 / 他人仓库的动态聚合（received_events 单流移除）。
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
├── client/components.ts  # Client 侧：认证面板 + 动态面板 UI
├── client/types.d.ts     # 浏览器模块 ambient 声明
├── client-dist/client.js # esbuild 产物（构建生成）
├── dist/                 # tsc 产物（构建生成）
├── package.json          # @vibepm/plugin-github，vibepm 清单
└── tsconfig.json
```

替换链路（影响面，7 处，实现时同步修改）：

1. 新建 `packages/plugin-github`（迁移自两个旧插件代码并增强）。
2. `packages/core/src/loader.ts`：bundles minimal 列表中的 `plugin-github-auth`、`plugin-repo-feed` → `plugin-github`。
3. `packages/plugin-plugin-manager/src/index.ts`：插件元数据两条 → 合并一条 `plugin-github`。
4. `packages/plugin-ide-view/client/components.ts`：面板组件 `case "github-auth-panel"` → 适配新组件（认证面板沿用 `github-auth-panel`，动态面板新注册）。
5. 删除 `packages/plugin-github-auth`、`packages/plugin-repo-feed` 两目录。
6. workspace / tsconfig reference 更新（移除对两个旧包的依赖与引用）。
7. `plugin-onboarding` 无硬依赖（导航卡自注册），不动。

## 6. 认证三源

优先级：gh CLI 自动读 > Device Flow > 手动 PAT 兜底。

### 6.1 gh CLI 自动读（主，零输入）

- 优先执行 `gh auth token`（若 `gh` 在 PATH），取 stdout 作为 token。
- `gh` 未安装 / 失败 → 解析 hosts.yml：
  - Windows：`%APPDATA%\GitHub CLI\hosts.yml`
  - POSIX：`~/.config/gh/hosts.yml`
  - 取 `github.com:` 下 `oauth_token` 字段。
- 仅读取，不写入、不修改任何 gh 配置。

### 6.2 Device Flow（次，浏览器授权）

- GitHub 官方 Device Flow：需要 OAuth App 的公开 `client_id`（仅 client_id 参与，client_secret 不参与）。
- 流程：
  1. `POST /api/github/device/start` → GitHub 返回 `device_code` / `user_code` / `verification_uri` / `expires_in` / `interval`。
  2. 前端展示 `user_code` + 授权链接（verification_uri），引导用户打开浏览器授权。
  3. 前端按 `interval` 自动轮询 `POST /api/github/device/poll`。
  4. 轮询成功 → 拿 `access_token` 存 settings；失败（expired/denied/pending）→ 明确提示并允许重开。
- `client_id` 做成配置项，内置默认值，可被用户覆盖。

### 6.3 手动 PAT（兜底）

- 保留现有 username + PAT 表单，置于设置面板最不显眼位置。

### 6.4 token 存储与来源标记

- token 仍存 settings（`github.token`），username 存 `github.username`。
- 新增 `github.source` 记录来源（`gh` / `device` / `pat`），`/status` 展示。
- 优先解析顺序（运行时）：
  1. gh CLI 实时读取（每次取用，保证与本地 gh 同步）；
  2. 无 gh 时回退到 settings 中存的手动/device token。

## 7. github service 增强

保留现有 `fetchJson` / `me`，新增：

- `listRepos(): Promise<RepoMeta[]>`：`GET /user/repos?per_page=100&sort=updated` 分页合并全量，返回仓库元数据（name、full_name、description、language、updated_at、html_url、default_branch 等）。
- `repoEvents(owner, repo): Promise<any[]>`：`GET /repos/:owner/:repo/events?per_page=30`。
- 内存 TTL 缓存：repos 与单仓 events 各缓存 60s（可配置 `cache_ttl`），降低限流与延迟。缓存 key 含 token 归属，logout 时清空。

## 8. API 设计（统一前缀 /api/github/*）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/github/status | 连接状态 + 来源（gh/device/pat）+ 当前用户 |
| POST | /api/github/login | 手动 PAT 兜底（username + token） |
| POST | /api/github/logout | 清 token/username/source + 清缓存 |
| POST | /api/github/device/start | 发起 Device Flow，返回授权码与链接 |
| POST | /api/github/device/poll | 轮询授权状态，成功返回 token |
| GET | /api/github/repos | 我的仓库列表（带缓存） |
| GET | /api/github/repos/:owner/:repo/events | 单仓动态（带缓存） |
| GET | /api/github/feed | 聚合：我的仓库 + 每仓 events，按仓库分组；`?refresh=1` 强刷 |

移除旧 `/api/feed`（received_events 单流）。

## 9. 动态数据方案

采用**逐仓聚合**：

1. `GET /user/repos` 取我的全部仓库（分页合并，按 updated 排序）。
2. 并行拉取每仓 `GET /repos/:owner/:repo/events?per_page=30`，并发上限 5，单仓失败跳过并标记（不影响整体）。
3. 后端按仓库分组返回：`[{ repo, meta, items: FeedItem[] }]`。
4. 前端渲染"仓库头 + 该仓动态列表"。

FeedItem 字段（沿用并保留）：`id / type / icon / actor / title / repo / repo_url / created_at / raw`。

## 10. UI

- 面板 `#auth`（`github-auth-panel`，改造）：连接状态条（显示来源）+ Device Flow 授权区块 + 手动 PAT 兜底表单（折叠）。
- 面板 `#feed`（动态面板，新增/改造）：仓库分组列表，每仓库头部（名称、语言、更新时间、打开链接）+ 该仓动态 timeline（复用现有 push/PR/issue/release/star/fork 图标与相对时间）。
- 首页 nav 导航卡两张：`#auth`（连接）+ `#feed`（仓库动态），随插件装卸出现/消失。
- 沿用科研黄黑皮肤 CSS 变量（--skin-* / --yellow 等），不新增全局样式。

## 11. 配置（vibepm.configSchema）

- `client_id`：Device Flow 用 OAuth App client_id，默认内置值。
- `api_base`：默认 `https://api.github.com`（沿用）。
- `cache_ttl`：内存缓存秒数，默认 60。

## 12. 错误处理

- 无任何 token 且 gh CLI 不存在 → `/status` 返回未连接，前端引导走 Device Flow / PAT。
- gh CLI 存在但未登录 → 自动落到 Device Flow / PAT。
- 限流（403 / 429）→ 返回提示 + 优先命中缓存，失败仓库跳过并标记。
- Device Flow 过期/拒绝/超时 → 明确提示，允许重新发起。
- 单仓 events 拉取失败 → 该仓标记失败，其余正常返回。

## 13. 测试（真机验证，验收前必做）

1. 本机已登录 `gh` → 启动 vibepm，`/status` 显示来源 `gh`，`/feed` 正常按仓库分组展示。
2. 模拟无 gh（临时移走 gh 可执行/未登录）→ Device Flow 授权码流程 → 拿到 token → 动态正常。
3. 手动 PAT 兜底表单 → 连接 → 动态正常。
4. 仓库数量较多时：并行拉取不超限流，缓存命中，刷新用 `?refresh=1` 强刷。
5. logout → token/username/source 清空，缓存清空，回到未连接态。
6. 三个旧入口全部消失：`plugin-github-auth`、`plugin-repo-feed` 从 bundles/元数据/面板全部移除，无残留引用。

## 14. 风险与备注

- GitHub Events API 90 天 / 300 条上限：UI 文案需说明"近 90 天动态"，避免"所有动态"误导。
- Device Flow 需真实 OAuth App client_id：实现时需用户在 GitHub 创建 OAuth App（callback 可任意填写，Device Flow 不回调）。
- 影响面 7 处需一次改全（loader / plugin-manager / ide-view / workspace / tsconfig / 删两包），避免残留引用导致构建或加载失败。
- 对外可见内容（README / package.json 描述 / 仓库文档）不出现任何历史借鉴痕迹。
