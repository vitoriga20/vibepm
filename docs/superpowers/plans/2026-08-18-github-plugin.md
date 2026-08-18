# plugin-github 合并插件实现计划（整改版 · 先删后建）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## 本次重写要点（对照整改要求 A1–A18）

本计划在上一轮整改版（A1–A16，约 1522 行）基础上重写，按用户两点新要求增补 A17 / A18 并把 Task 顺序重排为「先删后建」。代码片段均为最终整改版，不是「建议」。

**本次重写新增（A 组/E 组之外）：**
- **A17** 分区阈值「默认 60、可运行时修改」，三级取值（settings 运行时键 > vibepm.json 配置 > 常量默认），`GithubReposPanel` 加「分区设置」UI 入口（见下）。
- **A18** Task 顺序重排为**先删后建**：Task 1 原子删除旧两插件 + 全链路清理（补上上一轮漏掉的 `vibepm-ts/task_plan.md`，实际残留 4 处，详见 Task 1 Step 3）；Task 2 起新建 plugin-github；最后一个 Task 才把 `"plugin-github"` 插回 `DEFAULT_BUNDLES.minimal`。Task 2 开头加「防复制旧死链路」显式说明。

**A 组 · 硬编码整改**
- **A1** 删除 package.json 的 `vibepm.configSchema`（已核实：基座全库无人读取该字段，纯死配置；真契约 `vibepm.node.schema` 仅在 `packages/core/src/loader.ts:328` 做类型校验、无 default 能力）。所有可配置默认值收敛到**唯一源头** `src/constants.ts`，代码一律 `cfg.xxx ?? constants.xxx` 引用。
- **A2** 双源/多源默认值收敛：`api_base` / `cache_ttl` / 分区阈值 / interval 的构造函数默认参数与 `??` 兜底只保留一处引用常量，去掉其余字面量副本。
- **A3** settings 键名抽到 `src/settings-keys.ts`（认证 5 键 + 阈值 3 键 = 8 键），全文件引用，消除原 15+ 处字符串散落。
- **A4** 共享常量模块覆盖：`API_PREFIX`（node/client 共用）、子路由路径、hash（`#auth`/`#repos`/`#repo`）、slot kind、事件枚举（node `commitFrequency` 与 client `classify`/`oneLine` 共用）、Device Flow 端点 URL、`grant_type`、scope 字符串、HTTP 状态码、错误码/错误信息、GitHub API headers（Accept media type / X-GitHub-Api-Version / User-Agent）、`SHORT_SHA_LEN=7`、`DAY_MS`。node 用 `src/constants.ts`、client 用 `client/constants.ts` 各自一份、内容同步（client 是 esbuild 独立 bundle、`--external:@vibepm/*`，不跨包 import node 常量；两端共享语义的值在两端文件内各存一份，**修改时同步**）。
- **A5** CSS 色值全部改主题变量（`--ink/--dim/--line/--line-strong/--yellow/--panel/--panel-alt/--panel-dark/--bg-deep/--danger/--mono/--display-cjk/--radius` 等），不带新造色值兜底；语言色 map 抽到 `client/constants.ts` 的 `LANG_COLORS`；圆角用 `var(--radius)`。已核实：`--bg2` 不是真实 token（`packages/plugin-web-ui/static/shell.css` :root 无此变量），原计划里 `var(--bg2,#16191c)` 一律改用 `--panel-alt` / `--bg-deep`。
- **A6** 用户可见文案（node 端错误消息 + client 三面板全部文案 + timeline oneLine 文案 + relTime 单位）集中到 `client/constants.ts` 的 `TEXT`（node 侧槽位文案在 `src/constants.ts`，两端口径一致）。**禁止把可配置阈值写进 UI 文案**：仓库列表「近 N 天提交 ≥ M 为活跃」由后端 `/repos` 下发**实际生效值** `activeWindowDays` / `activeMinCommits`（含 `statsWindowDays`）动态拼接，前端不写死 30/60。

**B 组 · 功能缺陷修复**
- **A7** 补详情面板 slot 注册（`slots.register("shell.primary", { id:"github/detail", …, route:"repo" })`），否则 `#repo?name=…` 详情面板永不渲染。放在 **Task 3 Step 5**（与其余槽位一起注册）。
- **A8** 仓库行点击 → `location.hash = "#repo?name=" + encodeURIComponent(full_name)`（`data-repo` + click 绑定，不是 `data-href="/repo?name=…"` 路径形式），与壳 hash 路由一致。
- **A9** `/status` 三源动态：不再只读 settings 的 `github.source`（gh 直连时该键不存在会误报 pat）；改为调 `service.auth()`（gh 可用→`"gh"`，否则读 settings 的 source 键）。
- **A10** logout 同时删除 `github.device_code` / `github.device_expires`。
- **A11** 缓存与限流对齐设计文档：events 缓存 key 含 token 尾 8 位指纹（`ev:owner/repo:<fp>`，`repoEvents()` 内部缓存）；`/repos` 聚合结果整体 TTL 缓存（key `repos:<fp>`）；单仓失败跳过并标记 `statsFailed`；`?refresh=1` 强刷清缓存。

**C 组 · 基座事实纠偏**
- **A12** 「涉及旧包的事实」纠正：旧两包 client **已迁移**到 `window.__VIBEPM_MODULES__ + render 注册表`，HTTP 路由也已用 `webServer.register`（全库无 `ctx.on("web-api/route")` 死链路）；唯一壳 URL import 残留是 `examples/plugin-hello/src/client.ts`（Task 1 清掉）。
- **A13** nav-card icon：onboarding icons map 只有 `github/settings/feed/help`，**没有 "repo"**，会 fallback 成 help 图标。决策：**不扩 onboarding**，仓库 nav 卡改用已存在的 `settings`（auth nav 卡用 `github`；repos 面板 header 图标用 ide-view 的 `git`）。
- **A14** Task 1 清理范围：**README.md（6 处）**、**`vibepm-ts/task_plan.md`（实际 4 处：行 16/17 架构描述、行 34 任务表 4.3、行 35 任务表 4.4、行 93 禁用示例；上一轮清理漏了该根目录文件）**、**examples/plugin-hello**（client.ts 壳 URL import + package.json esbuild external），并加显式 **tsconfig references 清理步骤**（`plugin-repo-feed/tsconfig.json` 引 `../plugin-github-auth/tsconfig.json` 随目录删除，grep 确认无残留后再 build）。
- **A15** Task 8 验收 scope 文案与代码 scope 常量同一源（`GH_SCOPE = "repo read:user read:org"`）。

**D 组 · 阈值口径统一 + 可配化**
- **A16** 分区阈值「近 30 天提交 **≥ 60** 为活跃」（默认），代码 `active = n >= minCommits`；config 默认 `active_min_commits: 60`、`active_window_days: 30`；UI 文案由后端下发的**实际生效值**动态生成。本计划全文不再出现 7天/5次 之类的旧口径（设计文档 §9.1 的 `> 60` 与 §11 的默认 7/5 均为旧口径，以本计划为准）。
- **A17** 阈值默认 60 且**可运行时修改**：分区阈值三级取值（优先级从高到低）
  1. **settings DB 运行时键**（UI「分区设置」修改 → 通用 `POST /api/settings` `{batch}` 写入 → 立即生效、持久化到 db）：`github.active_window_days` / `github.active_min_commits` / `github.stats_window_days`
  2. **vibepm.json 配置**（`ctx.mergedConfig("github")`，重启生效）：`active_window_days` / `active_min_commits` / `stats_window_days`
  3. **常量默认**（`src/constants.ts`：`ACTIVE_WINDOW_DAYS=30` / `ACTIVE_MIN_COMMITS=60` / `STATS_WINDOW_DAYS=30`，注释标注「默认值可被 settings/配置覆盖」）
  取数示例（每次请求内现算，db 实时读、改动即时生效）：
  ```ts
  const activeMin = (db.getSetting<number>(K_ACTIVE_MIN) ?? cfg.active_min_commits ?? ACTIVE_MIN_COMMITS);
  ```
  活跃判据保持 `n >= activeMin`（≥）。修改入口 UI（轻量，不过度设计）：`GithubReposPanel` 顶部可折叠「分区设置」小区块（两个数字输入：窗口天数、活跃提交数 + 保存按钮），保存 `POST /api/settings`（body `{batch:{ "github.active_window_days": n, "github.active_min_commits": m }}`，**复用 settings 插件通用 KV API，符合解耦，不新造路由**）；保存成功后 `GET /repos?refresh=1` 强刷（绕过聚合 TTL 缓存，立即按新阈值重分区）。列表分区文案必须由 `/repos` 响应下发的**实际生效值**动态拼接。新增 settings 键 `K_ACTIVE_WINDOW_DAYS` / `K_ACTIVE_MIN_COMMITS` / `K_STATS_WINDOW_DAYS` 进 `src/settings-keys.ts`（client 侧同名副本进 `client/constants.ts`）。`/status` 不变。
- **A18** Task 顺序「**先删后建**」，每一步 build 都保持绿：
  - **Task 1** 原子删除旧两插件 + 全链路清理（`git rm -r` 两目录；runtime.ts minimal **先删**两个旧 id 且**不立即加** plugin-github；README/task_plan/examples/lock/tsconfig references 全部清干净；残留扫描断言 0；`pnpm install` + `pnpm run build` 全绿，此时 minimal 无 github 插件属预期）。
  - **Task 2 起**新建 plugin-github（沿用 A1–A16 设计），全部代码用解耦后标准写法。
  - **最后 Task（Task 7）** 才把 `"plugin-github"` 插回 `minimal`（插在原 github-auth 的位置、settings 前）+ 补 README 接入行。
  - 防复制旧死链路：Task 2 开头显式声明「新建代码一律用 `webServer.register` 前缀路由 + `window.__VIBEPM_MODULES__` + render 注册表，绝不从 git 历史拷贝旧两包里的 `ctx.on("web-api/route")` 死链路或壳 URL import」。

---

**Goal:** 合并 `plugin-github-auth` + `plugin-repo-feed` 为单一 `plugin-github`，实现「gh CLI / Device Flow / PAT 三源连接 + 自有仓库列表（活跃/尘封分区，阈值默认 60 可运行时修改）+ 仓库详情动态（commits 为主）」的 3 页面插件。**先彻底删除旧两插件，再建新插件**，避免死链路残留、代码冗余。

**Architecture:** 严格按解耦后基座：Node 侧用 `webServer.register` 前缀路由 + `github` service（fetchJson 聚合）；Client 侧用 `window.__VIBEPM_MODULES__.register` + render 注册表 + Shadow DOM 面板组件。认证三源：gh CLI 实时读 → Device Flow → PAT 兜底。仓库列表由后端逐仓并行拉 events 计算提交数并分区：**近 `active_window_days`(默认 30) 天提交 ≥ `active_min_commits`(默认 60) 为活跃**（`active = n >= minCommits`；三级取值见 A17），否则尘封。不使用任何已废弃的 `ctx.on("web-api/route")` 或壳 URL import。

**Tech Stack:** TypeScript (NodeNext/ES2022) + pnpm workspace + esbuild (client bundle) + Node 22 全局 fetch + Web Components (Shadow DOM)。外部依赖零新增（gh CLI / hosts.yml 用 child_process + fs；Device Flow 用原生 fetch）。

**验证策略（本项目插件无单测设施，遵循现有模式）：** 每个 Task 以「tsc 类型检查 + 构建产物生成」为可编译门，最终以真机运行验收（Task 8）。提交粒度：每个 Task 完成后一个 commit。

**旧两包事实（已删除，供执行者理解合并背景；Task 1 已按基座实读清理）：**
- `plugin-github-auth` 提供 `github` service（fetchJson/me），`plugin-repo-feed` 通过 `@vibepm/plugin-github-auth`（workspace 依赖 + `plugin-repo-feed/tsconfig.json` 的 tsconfig reference）消费它——两者已在 Task 1 一并删除。
- 旧两包**已按解耦后标准实现**：HTTP 路由均用 `webServer.register({ kind:"prefix", path:"/api/…" })` + `routeCtx/sendJson`（全库无 `ctx.on("web-api/route")`，已 grep 证实该死链路只存在于历史记录 progress.md / task_plan.md:225）；client 均用 `window.__VIBEPM_MODULES__.register` + render 注册表，**无壳 URL import**。唯一壳 URL import 残留 `examples/plugin-hello/src/client.ts` 已在 Task 1 清掉。
- 旧两包的真正问题是「功能割裂 + 仅 PAT 手动填 + received_events 单流 + 无三源/无分区」，而非基座未迁移。
- `DEFAULT_BUNDLES.minimal` 在 `packages/cli/src/runtime.ts`：Task 1 先删两个旧 id（保持删后无引用），Task 7 插回 `plugin-github`。
- `plugin-plugin-manager` 已目录动态化（display/desc 从 package.json 派生），**无需改**。
- 壳 `plugin-ide-view` 面板渲染已数据驱动（render 注册表查表，`renderPrimary` 按 `payload.route === route` 匹配），**无需改**。

---

### Task 1: 彻底删除旧两插件 + 全链路清理（原子 commit，先删后建第一步）

> 目标：旧 `plugin-github-auth` / `plugin-repo-feed` 及一切残留引用一次清干净，`git rm` + 文档/示例/lock/tsconfig references 全链路同步，残留扫描断言为 0。此时 minimal 无任何 github 插件（属预期），build 仍全绿。**本 Task 不创建 plugin-github，也不往 minimal 插新 id。**

**Files:**
- Delete: `packages/plugin-github-auth/`（整个目录，`git rm -r`）
- Delete: `packages/plugin-repo-feed/`（整个目录，`git rm -r`）
- Modify: `packages/cli/src/runtime.ts`（minimal 删两个旧 id）
- Modify: `README.md`（6 处旧引用：删功能表两行、删包列表两行、minimal 数组去旧 id、示例 patch 行中性化）
- Modify: `vibepm-ts/task_plan.md`（4 处残留：行 16/17 架构描述、行 34 任务表 4.3、行 35 任务表 4.4、行 93 禁用示例；标注为文档同步）
- Modify: `examples/plugin-hello/src/client.ts`（壳 URL import → 解耦后标准）
- Modify: `examples/plugin-hello/package.json`（esbuild external 移除）
- Modify: `pnpm-lock.yaml`（`pnpm install` 自动更新，移除两个旧包声明 + repo-feed 对 github-auth 的依赖）

- [ ] **Step 1: git rm 旧两包目录**

Run: `git rm -r packages/plugin-github-auth packages/plugin-repo-feed`
Expected: 两目录及内容删除（含 package.json / tsconfig / src / client）。`plugin-repo-feed/tsconfig.json` 引 `../plugin-github-auth/tsconfig.json` 的 reference 随目录删除，无其他包 references 旧两包（已 grep 核实）。

- [ ] **Step 2: 改 runtime.ts —— minimal 先删两个旧 id（本 Task 不立即加 plugin-github）**

`packages/cli/src/runtime.ts`：
```ts
export const DEFAULT_BUNDLES: Record<string, string[]> = {
  minimal: [
    "plugin-storage",
    "plugin-web-ui",
    "plugin-ide-view",
    "plugin-onboarding",
    "plugin-settings",
    "plugin-plugin-manager",
    "plugin-ambient",
  ],
};
```
> 注意：删掉 `"plugin-github-auth"`（原在 onboarding 与 settings 之间）与 `"plugin-repo-feed"`（原在 settings 与 plugin-manager 之间），**本 Task 不插入 `"plugin-github"`**——Task 7 才插回（插在 settings 前、原 github-auth 的位置）。删后无任何引用，属预期。

- [ ] **Step 3: 清理 README.md（6 处）与 vibepm-ts/task_plan.md（4 处）与 examples/plugin-hello（2 处）**

先清文档与示例，再走残留扫描（扫描是 0 断言的最后关口，扫描前务必全清）。

**README.md（6 处，A14）**（行号为约数，以内容锚点定位为准）：
1. 功能表 `| GitHub | #auth | plugin-github-auth | PAT 连接 / 用户态校验 |` 整行删除（新 plugin-github 接入行在 Task 7 补回）。
2. 功能表 `| Feed | #feed | plugin-repo-feed | GitHub 仓库动态（received_events） |` 整行删除（feed 能力并入 plugin-github）。
3. 包列表 `| @vibepm/plugin-github-auth | GitHub 连接，提供 github 服务 |` 整行删除。
4. 包列表 `| @vibepm/plugin-repo-feed | 仓库动态 feed 面板 |` 整行删除。
5. minimal 数组行 `minimal = [storage | web-ui | ide-view | onboarding | github-auth | settings | repo-feed | plugin-manager]` → `minimal = [storage | web-ui | ide-view | onboarding | settings | plugin-manager]`（与 runtime.ts 删后状态一致；`github` 占位由 Task 7 补）。
6. 示例 patch 行 `{ "id": "plugin-repo-feed", "config": { "fast": true } },` → 改为中性示例 `{ "id": "my-plugin", "config": { "fast": true } },`（示例不再引用已删插件）。

**vibepm-ts/task_plan.md（4 处，根目录文件，上一轮清理范围漏了它）**：
1. 行 16-17（阶段 4 插件架构描述）：两条 `plugin-github-auth` / `plugin-repo-feed` 合并改写为一条 `plugin-github`：
   - 行 13 标题 `- **阶段 4 4 个新插件**:` → `- **阶段 4 3 个新插件**（plugin-github-auth 与 plugin-repo-feed 合并为 plugin-github）:`
   - 行 16 → `3. \`plugin-github\`（Node + Client + \`/api/github/*\`）：合并原 github-auth 认证（gh CLI / Device Flow / PAT 三源，token 存 settings，提供 github service）+ repo-feed 仓库动态（自有仓库分区列表 + 单仓动态 commits 为主），向 \`shell.nav\` 注册状态卡、向 \`shell.primary\` 注册 #auth/#repos/#repo 三面板`
   - 行 17 → 整行删除（能力并入 3）
2. 行 34（任务表 4.3）：`生成 \`plugin-github-auth\` Node + Client + OAuth 设备码握手...` → 改写为 `生成 \`plugin-github\` Node + Client + \`/api/github/*\`：合并原 github-auth 认证三源 + repo-feed 仓库列表/详情；写 settings \`github.*\` 键，提供 github service（rest 客户端），注册三面板与 nav 卡`（依赖保持 `3.2`）
3. 行 35（任务表 4.4）：`生成 \`plugin-repo-feed\` Node + Client...` → 改写为 `（已并入 4.3：仓库分区列表 + 单仓动态能力并入 plugin-github 的 #repos/#repo 面板）`
4. 行 93（patch 禁用示例）：`{ id: "plugin-repo-feed", disabled: true }` → `{ id: "plugin-github", disabled: true }`（示例引用现存插件，与上下文行 92 用 `plugin-settings` 的写法一致）
   > 注：task_plan.md 行 145 / 203 提及 `/plugins/plugin-ide-view/module-system.js` 属 P2/P3 已完成的迁移历史记录（progress.md 证实），不匹配本插件残留扫描 pattern（`plugin-github-auth|plugin-repo-feed`），不动。

**examples/plugin-hello（2 处，唯一壳 URL import 残留 + esbuild external）**：
1. `src/client.ts`：删除 `// @ts-ignore TS 无法识别浏览器专用的 URL 模块` + `import { modules } from "/plugins/plugin-ide-view/module-system.js";`，改为解耦后标准：
```ts
// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
```
2. `package.json` 的 `build:client`：去掉 `--external:/plugins/plugin-ide-view/module-system.js`，改为 `npx esbuild src/client.ts --bundle --format=esm --platform=browser --outfile=dist/client.js`。

- [ ] **Step 4: tsconfig references 清理确认**

已核实：仅 `plugin-repo-feed/tsconfig.json` 引用了 `../plugin-github-auth/tsconfig.json`，该文件随目录删除即消失；无其他包 references 旧两包。执行确认：
Run: 使用 Grep 工具扫描（pattern `plugin-github-auth|plugin-repo-feed`，path `packages`）
Expected: 无输出（两目录已删、无残留 references）；确认后再 build。

- [ ] **Step 5: 刷新 workspace 依赖 + 构建全绿**

Run: `pnpm install`
Expected: lockfile 更新，移除 `packages/plugin-github-auth` / `packages/plugin-repo-feed` 两段声明与 repo-feed 对 github-auth 的依赖（`pnpm-lock.yaml` 原 3 处）。
Run: `pnpm run build`
Expected: 全仓构建通过，无引用旧包。**此时 minimal 无 github 插件（Task 1 只删不插），build 绿属预期。**

- [ ] **Step 6: 残留扫描（务必为 0）**

Run: 使用 Grep 工具扫描（pattern `plugin-github-auth|plugin-repo-feed`，path 覆盖 `packages`、`examples`、`README.md`、`task_plan.md`；**task_plan.md 在 vibepm-ts 根目录，不是 docs 下**）
Expected: 无输出（旧两包 id 全仓清零）。补充确认：`examples/plugin-hello` 已无 `/plugins/plugin-ide-view/module-system.js`（壳 URL import 与 esbuild external 均已移除）。若 `plugin-settings/src/index.ts` 等仅有中文文案提及（如「GitHub 用户名」），属正常文案，不改。

- [ ] **Step 7: 提交**

```bash
git add -A packages/cli/src/runtime.ts README.md task_plan.md examples/plugin-hello pnpm-lock.yaml
git commit -m "chore(github): 删除 plugin-github-auth/plugin-repo-feed 并清理全链路残留（runtime/README/task_plan/examples/lock/tsconfig）"
```
> 注：`git rm` 已把两目录从索引移除，本 `git add -A` 负责其余修改与 lockfile。

---

### Task 2: 新插件骨架 + 构建接入（先删后建第二步）

> ⚠ **防复制旧死链路（执行者必读，A18）**：旧两包（plugin-github-auth / plugin-repo-feed）已在 Task 1 删除。新建 plugin-github 的代码**一律按解耦后标准手写 / 照本计划各 Task 的代码片段**，**绝不**从 git 历史（`git show <old>:` / `git log -p` / `git checkout` 拷贝）取旧两包代码：
> - Node 侧 HTTP 路由用 `webServer.register({ kind:"prefix", path:"/api/github", handler })` + `routeCtx/sendJson/readBody`（来自 `@vibepm/plugin-web-ui`），**不用**旧 `ctx.on("web-api/route")` 死链路（全库已无 emit，已 grep 证实）；
> - Client 侧用 `window.__VIBEPM_MODULES__.register` + `customElements.define` + `services.get("render").register`，**不 import** `/plugins/plugin-ide-view/module-system.js` 壳 URL（唯一残留 examples/plugin-hello 已在 Task 1 清掉）。
> 本计划代码片段即为最终实现，直接采用，勿"参照旧包"。

**Files:**
- Create: `packages/plugin-github/package.json`
- Create: `packages/plugin-github/tsconfig.json`
- Create: `packages/plugin-github/src/index.ts`
- Create: `packages/plugin-github/client/index.ts`
- Create: `packages/plugin-github/client/types.d.ts`

- [ ] **Step 1: 创建 package.json**

旧两包已删，无参照对象，以下为完整内容直接采用。**删除 `vibepm.configSchema`**（基座全库无人读取，纯死配置；见本次重写要点 A1）；不补 `node.schema`（默认值进 `src/constants.ts`，`vibepm.node.schema` 仅类型校验且非必需）。依赖只引 `@vibepm/core` / `@vibepm/plugin-ide-view` / `@vibepm/plugin-web-ui`，**不依赖**旧两包：

```json
{
  "name": "@vibepm/plugin-github",
  "version": "0.1.0",
  "description": "GitHub 连接 + 自有仓库动态管理（gh CLI / Device Flow / PAT 三源）。",
  "private": true,
  "type": "module",
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./client": {
      "types": "./dist/client/index.d.ts",
      "default": "./dist/client/index.js"
    }
  },
  "scripts": {
    "clean": "rimraf dist client-dist",
    "build:ts": "tsc -b",
    "build:client": "esbuild client/index.ts --bundle --format=esm --outfile=client-dist/client.js --platform=browser --external:@vibepm/*",
    "build": "pnpm run clean && pnpm run build:ts && pnpm run build:client",
    "dev": "pnpm run build"
  },
  "dependencies": {
    "@vibepm/core": "workspace:*",
    "@vibepm/plugin-ide-view": "workspace:*",
    "@vibepm/plugin-web-ui": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.10.10",
    "esbuild": "^0.24.2",
    "rimraf": "^6.0.1",
    "typescript": "^5.7.3"
  },
  "vibepm": {
    "id": "plugin-github",
    "display": "GitHub",
    "role": "service+panel",
    "order": 20,
    "node": {
      "immediately": true,
      "inject": ["db", "slots", "webServer"],
      "provide": ["github"]
    },
    "client": {
      "entry": "./client-dist/client.js",
      "inject": [],
      "provide": [],
      "immediately": true
    }
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

extends 根 base，rootDir "."，include src + client，references 到 core / plugin-ide-view / plugin-web-ui（三个依赖包，**不含已删旧包**）：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "tsBuildInfoFile": "dist/.tsbuildinfo",
    "composite": true
  },
  "include": ["src/**/*.ts", "client/**/*.ts", "client/**/*.d.ts"],
  "references": [
    { "path": "../core/tsconfig.json" },
    { "path": "../plugin-ide-view/tsconfig.json" },
    { "path": "../plugin-web-ui/tsconfig.json" }
  ]
}
```

- [ ] **Step 3: 创建最小 Node 入口 src/index.ts（占位 apply，Task 3 填充）**

```ts
import type { Context } from "@vibepm/core";

class GithubPlugin {
  name = "plugin-github";
  provide = ["github"];
  inject = ["db", "slots", "webServer"] as const;

  apply(ctx: Context): () => void {
    return () => undefined;
  }
}

export const PLUGIN = new GithubPlugin();
```

- [ ] **Step 4: 创建最小 client 入口 + ambient 声明**

`client/index.ts`（解耦后标准：window 模块表，不 import 壳 URL）：

```ts
// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};

modules.register("plugin-github", () => ({
  name: "plugin-github",
  inject: [],
  provide: [],
  apply(_ctx: unknown) {
    // Task 6 填充：customElements.define + render.register
  },
}));
```

`client/types.d.ts`（保留，供 client 侧非 TS 模块用；此插件 client 无外部模块 import，可留空声明）：

```ts
export {};
```

- [ ] **Step 5: 构建验证**

Run: `pnpm --filter @vibepm/plugin-github run build`
Expected: 生成 `dist/` 与 `client-dist/client.js`，无 TS 错误。随后：
Run: `pnpm run lint`
Expected: 通过（tsc -p tsconfig.base.json --noEmit）。

- [ ] **Step 6: 提交**

```bash
git add packages/plugin-github
git commit -m "feat(github): 新建 plugin-github 骨架（三源连接 + 仓库动态合并插件，去 configSchema）"
```

---

### Task 3: Node 侧常量唯一源 + 认证三源 + github service + status/login/logout/分区 API + 阈值三级可配

**Files:**
- Create: `packages/plugin-github/src/constants.ts`
- Create: `packages/plugin-github/src/settings-keys.ts`
- Create: `packages/plugin-github/src/auth.ts`
- Create: `packages/plugin-github/src/github-service.ts`
- Modify: `packages/plugin-github/src/index.ts`

- [ ] **Step 1: 写 src/constants.ts（Node 侧唯一配置源头）**

所有可配置默认值 / 路由 / 端点 / 枚举集中于此，**禁止第二处重写字面量**。使用方式：`cfg.xxx ?? constants.xxx`（配置优先，常量兜底）。**A17：阈值常量注释标注「默认值可被 settings / vibepm.json 配置覆盖」（三级取值见 src/index.ts 的 `thresholds()`）**：

```ts
// Node 侧唯一配置源头：所有可配置默认值 / 路由 / 端点 / 枚举集中于此，禁止第二处重写字面量。

// ---- 可配置默认值（唯一源）----
// 阈值（active_* / stats_*）为「默认值」：三级取值 settings 运行时键（github.active_window_days 等，
// UI「分区设置」可改，立即生效）> vibepm.json 配置（ctx.mergedConfig("github")，重启生效）> 本常量兜底。
// 取数见 src/index.ts 的 thresholds()；活跃判据为 近 active_window_days 天提交 >= active_min_commits（注意 >=）。
export const API_BASE = "https://api.github.com";
export const CACHE_TTL_S = 60;           // 内存缓存 TTL（秒）
export const ACTIVE_WINDOW_DAYS = 30;    // 活跃判据窗口（天）——默认值；可被 settings / vibepm.json 配置覆盖
export const ACTIVE_MIN_COMMITS = 60;    // 活跃判据最少提交数：近 ACTIVE_WINDOW_DAYS 天内提交 ≥ 该值 为活跃（注意 ≥）——默认值；可被 settings / vibepm.json 配置覆盖
export const STATS_WINDOW_DAYS = 30;     // 展示提交数的窗口（天）——默认值；可被 settings / vibepm.json 配置覆盖
export const GH_TIMEOUT_MS = 8000;       // gh CLI 执行超时
export const REQUEST_TIMEOUT_MS = 20000; // GitHub API 请求超时
export const REPOS_PER_PAGE = 100;       // 分页大小
export const REPO_PARALLEL = 5;          // /repos 逐仓并发上限
export const DEVICE_POLL_INTERVAL_S = 5; // Device Flow 轮询间隔兜底（秒）
export const DEVICE_EXPIRES_IN_S = 900;  // Device Flow 过期兜底（秒）
export const SHORT_SHA_LEN = 7;          // commit 短 sha 长度
export const DAY_MS = 86_400_000;        // 1 天毫秒数

// ---- 认证 / 端点 / headers ----
export const GH_DEVICE_CODE_URL = "https://github.com/login/device/code";
export const GH_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
export const GH_SCOPE = "repo read:user read:org"; // 唯一 scope 源（PAT 提示与 /device/start 同源引用）
export const GH_ACCEPT_MEDIA = "application/vnd.github+json";
export const GH_API_VERSION = "2022-11-28";
export const GH_USER_AGENT = "vibepm";
export const JSON_ACCEPT = "application/json";
export const JSON_CONTENT_TYPE = "application/json";

// ---- 路由（node/client 口径一致，client 侧同名副本见 client/constants.ts）----
export const API_PREFIX = "/api/github";
export const R_SUB_STATUS = "/status";
export const R_SUB_LOGIN = "/login";
export const R_SUB_LOGOUT = "/logout";
export const R_SUB_REPOS = "/repos";
export const R_SUB_DEVICE_START = "/device/start";
export const R_SUB_DEVICE_POLL = "/device/poll";

// ---- hash 路由 / 面板 kind / 槽位 id（node 注册；client 复用 hash 与 kind，见 client/constants.ts）----
export const HASH_AUTH = "auth";
export const HASH_REPOS = "repos";
export const HASH_REPO = "repo";
export const PANEL_KIND_AUTH = "github-auth-panel";
export const PANEL_KIND_REPOS = "github-repos-panel";
export const PANEL_KIND_DETAIL = "github-repo-detail-panel";
export const SLOT_AUTH = "github/auth";
export const SLOT_AUTH_NAV = "github/auth-nav";
export const SLOT_REPOS = "github/repos";
export const SLOT_REPOS_NAV = "github/repos-nav";
export const SLOT_DETAIL = "github/detail";

// ---- 面板 / 导航槽注册文案（node 侧；client 侧 TEXT 需口径一致，见 client/constants.ts）----
export const TEXT_AUTH_TITLE = "连接 GitHub";
export const TEXT_AUTH_DESC = "gh CLI 直连 / Device Flow / PAT 兜底；只读自己仓库动态，不做拉取推送。";
export const TEXT_AUTH_NAV_DESC = "连接 GitHub（gh / Device Flow / PAT）";
export const TEXT_REPOS_TITLE = "我的仓库";
export const TEXT_REPOS_DESC = "自有仓库，按近 N 天提交分区（活跃 / 尘封，N/M 可在面板「分区设置」调整）";
export const TEXT_REPOS_NAV_DESC = "自有仓库列表：活跃区 + 尘封区";
export const TEXT_DETAIL_TITLE = "仓库动态";
export const TEXT_DETAIL_DESC = "单仓动态 timeline（commits 为主）";

// ---- HTTP 状态码 ----
export const HTTP = { OK: 200, BAD_REQUEST: 400, NOT_FOUND: 404, BAD_GATEWAY: 502 } as const;

// ---- 错误码 / 错误信息（node 端；客户端文案见 client/constants.ts 的 TEXT）----
export const ERR_NO_TOKEN = "NO_TOKEN";
export const ERR_MSG_NO_TOKEN = "未连接 GitHub";
export const ERR_MSG_LOGIN_REQUIRED = "需要 username + token";
export const ERR_MSG_DEVICE_CLIENT_ID = "未配置 client_id：请在配置 github.client_id 填 GitHub OAuth App 的公开 client_id";
export const ERR_MSG_NOT_FOUND = "not found";
export const ERR_MSG_GITHUB = (status: number, message: string): string => `GitHub ${status}: ${message}`;

// ---- 事件类型（node commitFrequency 与 client classify/oneLine 共享语义；client 同名副本见 client/constants.ts）----
export const EVENT_TYPE_PUSH = "PushEvent";
export const EVENT_TYPE_PULL_REQUEST = "PullRequestEvent";
export const EVENT_TYPE_ISSUES = "IssuesEvent";
export const EVENT_TYPE_RELEASE = "ReleaseEvent";
export const EVENT_TYPE_WATCH = "WatchEvent";
export const EVENT_TYPE_FORK = "ForkEvent";
export const EVENT_TYPE_CREATE = "CreateEvent";
export const EVENT_TYPE_STAR = "StarEvent";
```

- [ ] **Step 2: 写 src/settings-keys.ts（settings 键名唯一源，认证 5 键 + 阈值 3 键）**

```ts
// settings 键名唯一源：全仓引用，禁止字符串散落（消除原 15+ 处字面量）。
// ---- 认证相关 5 键 ----
export const K_TOKEN = "github.token";
export const K_USERNAME = "github.username";
export const K_SOURCE = "github.source";
export const K_DEVICE_CODE = "github.device_code";
export const K_DEVICE_EXPIRES = "github.device_expires";
// ---- 阈值运行时键 3 键（A17：UI「分区设置」修改 → POST /api/settings {batch} 写入，立即生效、持久化到 db；
//      优先级高于 vibepm.json 配置与常量默认；client 侧同名副本见 client/constants.ts）----
export const K_ACTIVE_WINDOW_DAYS = "github.active_window_days";
export const K_ACTIVE_MIN_COMMITS = "github.active_min_commits";
export const K_STATS_WINDOW_DAYS = "github.stats_window_days";
```

- [ ] **Step 3: 写 src/auth.ts（gh CLI 读取 + hosts.yml 解析 + 三源 token 解析）**

gh CLI 优先 `gh auth token`；失败回退解析 hosts.yml。hosts.yml 用行扫描（不引 YAML 库）。`source` 三源同步：gh 可用→`"gh"`，否则读 settings 的 source 键（device/pat）：

```ts
// 认证三源 token 解析：gh CLI 实时读 → settings 里的 device/pat token
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { GH_TIMEOUT_MS } from "./constants.js";
import { K_TOKEN, K_SOURCE } from "./settings-keys.js";

export type TokenSource = "gh" | "device" | "pat";
export type AuthResult = { token: string | null; source: TokenSource };

/** 尝试 gh auth token；gh 不存在/未登录 → null */
export function ghToken(): string | null {
  try {
    const out = execFileSync("gh", ["auth", "token"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: GH_TIMEOUT_MS,
      windowsHide: true,
    });
    const t = String(out ?? "").trim();
    return t || null;
  } catch {
    return null;
  }
}

/** gh 不存在时回退解析 hosts.yml 的 github.com.oauth_token（行扫描，不引 YAML 库） */
export function ghHostsToken(): string | null {
  const candidates: string[] = process.platform === "win32"
    ? [join(process.env.APPDATA ?? "", "GitHub CLI", "hosts.yml")]
    : [join(homedir(), ".config", "gh", "hosts.yml")];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    let text = "";
    try { text = readFileSync(p, "utf-8"); } catch { continue; }
    // 定位 github.com: 段，取其下 oauth_token: <token>
    const lines = text.split(/\r?\n/);
    let inGithub = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("github.com:") || trimmed === "github.com") { inGithub = true; continue; }
      if (inGithub && /^[^:#][^:]*:/.test(trimmed) && !trimmed.startsWith("oauth_token")) { inGithub = false; }
      if (inGithub && /^oauth_token\s*:/.test(trimmed)) {
        const m = trimmed.match(/oauth_token\s*:\s*(?:"([^"]+)"|'([^']+)'|(\S+))/);
        const t = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
        if (t) return t;
      }
    }
  }
  return null;
}

/** 解析 token 来源：gh CLI（含 hosts 回退）→ settings 里的 device/pat；source 三源同步 */
export function resolveToken(getSetting: <T = unknown>(k: string) => T | null): AuthResult {
  const gh = ghToken() ?? ghHostsToken();
  if (gh) return { token: gh, source: "gh" };
  const stored = getSetting<string>(K_TOKEN);
  if (stored) return { token: stored, source: (getSetting<string>(K_SOURCE) as TokenSource) ?? "pat" };
  return { token: null, source: "pat" };
}
```

- [ ] **Step 4: 写 src/github-service.ts（GitHubService：三源认证 + TTL 缓存 + 聚合）**

复用并增强现有 GitHubService：保留 `fetchJson` / `me`，新增 `listRepos` / `repoEvents` / `commitFrequency` 与内存 TTL 缓存。token 走 `auth()`（三源解析）；缓存 key 含 token 尾 8 位指纹：

```ts
// GitHub REST 封装：fetchJson 通用 + 三源认证 + 仓库/事件聚合 + TTL 缓存
import { resolveToken, type AuthResult } from "./auth.js";
import {
  API_BASE, CACHE_TTL_S, DAY_MS, GH_ACCEPT_MEDIA, GH_API_VERSION, GH_USER_AGENT,
  ERR_NO_TOKEN, ERR_MSG_NO_TOKEN, ERR_MSG_GITHUB, REPOS_PER_PAGE, REQUEST_TIMEOUT_MS, EVENT_TYPE_PUSH,
} from "./constants.js";

export type DbLike = {
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

export type GhUser = { login: string; name?: string; avatar_url?: string };
export type RepoMeta = {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  private: boolean;
  archived: boolean;
  fork: boolean;
  updated_at: string;
};

export class GitHubService {
  name = "github";
  constructor(
    private readonly db: DbLike,
    private readonly apiBase = API_BASE,
    private readonly cacheTtlMs = CACHE_TTL_S * 1000,
  ) {}

  // ---- 三源认证（gh 实时读 → settings device/pat；/status 也用此判断 source）----
  auth(): AuthResult { return resolveToken((k) => this.db.getSetting(k)); }
  /** token 尾 8 位指纹：缓存 key 归属（logout / 换 token 后自然失效） */
  tokenFingerprint(): string {
    const t = this.auth().token ?? "";
    return t.length > 8 ? t.slice(-8) : t;
  }

  // ---- 内存 TTL 缓存 ----
  private cache = new Map<string, { at: number; val: unknown }>();
  cacheGet<T>(key: string): T | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.cacheTtlMs) { this.cache.delete(key); return undefined; }
    return hit.val as T;
  }
  cacheSet(key: string, val: unknown): void { this.cache.set(key, { at: Date.now(), val }); }
  clearCache(): void { this.cache.clear(); }

  // ---- 通用请求（token 走三源解析）----
  async fetchJson(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<any> {
    const { token } = this.auth();
    if (!token) throw Object.assign(new Error(ERR_MSG_NO_TOKEN), { code: ERR_NO_TOKEN });
    const base = this.apiBase;
    const url = /^https?:/.test(path) ? path : base + (path.startsWith("/") ? "" : "/") + path;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": GH_ACCEPT_MEDIA,
          "X-GitHub-Api-Version": GH_API_VERSION,
          "User-Agent": GH_USER_AGENT,
          ...(opts.body ? { "Content-Type": JSON_CONTENT_TYPE } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      const text = await r.text();
      let json: any; try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
      if (!r.ok) throw Object.assign(new Error(ERR_MSG_GITHUB(r.status, json?.message ?? r.statusText)), { code: "GH_" + r.status, json });
      return json;
    } finally { clearTimeout(timer); }
  }

  async me(): Promise<GhUser | null> {
    try { return (await this.fetchJson("/user")) as GhUser; }
    catch (e) { if ((e as any).code === ERR_NO_TOKEN) return null; throw e; }
  }

  // ---- 仓库列表（分页合并全量）----
  async listRepos(): Promise<RepoMeta[]> {
    const out: any[] = [];
    let page = 1;
    for (;;) {
      const batch = await this.fetchJson(`/user/repos?per_page=${REPOS_PER_PAGE}&sort=updated&page=${page}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      out.push(...batch);
      if (batch.length < REPOS_PER_PAGE) break;
      page += 1;
    }
    return out as RepoMeta[];
  }

  // ---- 单仓 events（TTL 缓存，key 含 token 尾 8 位指纹；/repos 聚合与单仓详情共用）----
  async repoEvents(owner: string, repo: string): Promise<any[]> {
    const key = `ev:${owner}/${repo}:${this.tokenFingerprint()}`;
    const cached = this.cacheGet<any[]>(key);
    if (cached) return cached;
    const data = await this.fetchJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/events?per_page=${REPOS_PER_PAGE}`);
    const arr = Array.isArray(data) ? data : [];
    this.cacheSet(key, arr);
    return arr;
  }

  // ---- 提交频率：近 N 天 PushEvent distinct_size 累加 ----
  commitFrequency(events: any[], days: number): number {
    const cutoff = Date.now() - days * DAY_MS;
    let n = 0;
    for (const e of events) {
      if (e?.type !== EVENT_TYPE_PUSH) continue;
      const at = Date.parse(e?.created_at ?? "");
      if (!Number.isFinite(at) || at < cutoff) continue;
      n += Number(e?.payload?.distinct_size ?? e?.payload?.size ?? 0) || 0;
    }
    return n;
  }
}
```

- [ ] **Step 5: 改 src/index.ts —— 提供 github service + status/login/logout/repos API + 阈值三级取值 + 三页面槽位**

改用解耦后标准：`webServer.register` 前缀路由；inject db/slots/webServer。token 三源解析在 service 内完成（`service.auth()`）。settings 存 `github.username` / `github.token` / `github.source` / `github.device_code` / `github.device_expires`。**A7：此处一并补详情面板 slot 注册**（缺失则 `#repo?name=…` 详情面板永不渲染）。**A17：`thresholds()` 三级取值（settings 运行时键 > vibepm.json 配置 > 常量默认），`/repos` 与单仓 events 分支用其实际值下发，`/status` 不变**：

```ts
import type { Context } from "@vibepm/core";
import { readBody, sendJson, routeCtx, type WebServerService } from "@vibepm/plugin-web-ui";
import type { SlotName, SlotService } from "@vibepm/plugin-ide-view";
import { GitHubService } from "./github-service.js";
import {
  API_PREFIX, R_SUB_STATUS, R_SUB_LOGIN, R_SUB_LOGOUT, R_SUB_REPOS, R_SUB_DEVICE_START, R_SUB_DEVICE_POLL,
  API_BASE, CACHE_TTL_S, ACTIVE_WINDOW_DAYS, ACTIVE_MIN_COMMITS, STATS_WINDOW_DAYS, REPO_PARALLEL,
  GH_DEVICE_CODE_URL, GH_ACCESS_TOKEN_URL, DEVICE_GRANT_TYPE, GH_SCOPE, JSON_ACCEPT, JSON_CONTENT_TYPE,
  DEVICE_POLL_INTERVAL_S, DEVICE_EXPIRES_IN_S, HTTP,
  HASH_AUTH, HASH_REPOS, HASH_REPO, PANEL_KIND_AUTH, PANEL_KIND_REPOS, PANEL_KIND_DETAIL,
  SLOT_AUTH, SLOT_AUTH_NAV, SLOT_REPOS, SLOT_REPOS_NAV, SLOT_DETAIL,
  TEXT_AUTH_TITLE, TEXT_AUTH_DESC, TEXT_AUTH_NAV_DESC, TEXT_REPOS_TITLE, TEXT_REPOS_DESC, TEXT_REPOS_NAV_DESC, TEXT_DETAIL_TITLE, TEXT_DETAIL_DESC,
  ERR_MSG_LOGIN_REQUIRED, ERR_MSG_DEVICE_CLIENT_ID, ERR_MSG_NOT_FOUND,
} from "./constants.js";
import { K_TOKEN, K_USERNAME, K_SOURCE, K_DEVICE_CODE, K_DEVICE_EXPIRES, K_ACTIVE_WINDOW_DAYS, K_ACTIVE_MIN_COMMITS, K_STATS_WINDOW_DAYS } from "./settings-keys.js";

type DbLike = {
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

/** 配置默认值唯一源 = src/constants.ts；合并短名（github）与 entry id（plugin-github）两层 */
type GithubConfig = {
  api_base: string;
  client_id: string;
  cache_ttl: number;
  active_window_days: number;
  active_min_commits: number;
  stats_window_days: number;
};

class GithubPlugin {
  name = "plugin-github";
  provide = ["github"];
  inject = ["db", "slots", "webServer"] as const;

  apply(ctx: Context): () => void {
    const db = ctx.get("db") as any as DbLike;
    const slots = ctx.get("slots") as any as SlotService;
    const ws = ctx.get("webServer") as WebServerService;
    const disposers: Array<() => void> = [];

    const cfg: GithubConfig = {
      api_base: API_BASE,
      client_id: "",
      cache_ttl: CACHE_TTL_S,
      active_window_days: ACTIVE_WINDOW_DAYS,
      active_min_commits: ACTIVE_MIN_COMMITS,
      stats_window_days: STATS_WINDOW_DAYS,
      ...ctx.mergedConfig("github"),
      ...ctx.mergedConfig("plugin-github"),
    };
    const service = new GitHubService(db, cfg.api_base, cfg.cache_ttl * 1000);
    ctx.provide("github", service);

    // A17：阈值三级取值——settings 运行时键（UI「分区设置」改，立即生效）> vibepm.json 配置（mergedConfig，重启生效）> 常量默认。
    // 每次请求内现算（db.getSetting 实时读），阈值改动即时反映，无需重启；活跃判据保持 n >= activeMinCommits（≥）。
    const thresholds = (): { activeWindowDays: number; activeMinCommits: number; statsWindowDays: number } => ({
      activeWindowDays: db.getSetting<number>(K_ACTIVE_WINDOW_DAYS) ?? cfg.active_window_days ?? ACTIVE_WINDOW_DAYS,
      activeMinCommits: db.getSetting<number>(K_ACTIVE_MIN_COMMITS) ?? cfg.active_min_commits ?? ACTIVE_MIN_COMMITS,
      statsWindowDays: db.getSetting<number>(K_STATS_WINDOW_DAYS) ?? cfg.stats_window_days ?? STATS_WINDOW_DAYS,
    });

    // --- API：webServer 前缀路由（解耦后标准，不用旧 web-api/route）---
    disposers.push(ws.register({
      kind: "prefix",
      path: API_PREFIX,
      handler: (req, res) => {
        const rctx = routeCtx(req, res);
        const sub = rctx.path.slice(API_PREFIX.length) || "/";

        // GET /status —— 三源动态解析（gh 直连→gh；否则读 settings 的 source 键；不得只读 settings）；A17 不改此分支
        if ((sub === R_SUB_STATUS || sub === R_SUB_STATUS + "/") && rctx.req.method === "GET") {
          void (async () => {
            try {
              const { source } = service.auth();
              const me = await service.me();
              if (!me) { sendJson(rctx.res, HTTP.OK, { ok: true, connected: false }); return; }
              sendJson(rctx.res, HTTP.OK, { ok: true, connected: true, source, username: me.login, me });
            } catch (e) { sendJson(rctx.res, HTTP.OK, { ok: false, connected: false, reason: (e as Error).message }); }
          })();
          return;
        }

        // POST /login（PAT 兜底）
        if ((sub === R_SUB_LOGIN || sub === R_SUB_LOGIN + "/") && rctx.req.method === "POST") {
          void (async () => {
            try {
              const body = await readBody(rctx.req);
              const username = String(body.username ?? "").trim();
              const token = String(body.token ?? "").trim();
              if (!username || !token) { sendJson(rctx.res, HTTP.BAD_REQUEST, { ok: false, reason: ERR_MSG_LOGIN_REQUIRED }); return; }
              db.setSetting(K_USERNAME, username);
              db.setSetting(K_TOKEN, token);
              db.setSetting(K_SOURCE, "pat");
              service.clearCache(); // 换 token → 旧指纹缓存作废
              const me = await service.me();
              if (me) db.setSetting(K_USERNAME, me.login); // 以 /user 返回的 login 为准
              sendJson(rctx.res, HTTP.OK, { ok: !!me, me: me ?? null });
            } catch (e) { sendJson(rctx.res, HTTP.OK, { ok: false, reason: (e as Error).message }); }
          })();
          return;
        }

        // POST /logout —— 清凭据 + device 残留 + 缓存
        if ((sub === R_SUB_LOGOUT || sub === R_SUB_LOGOUT + "/") && rctx.req.method === "POST") {
          db.deleteSetting(K_TOKEN);
          db.deleteSetting(K_USERNAME);
          db.deleteSetting(K_SOURCE);
          db.deleteSetting(K_DEVICE_CODE);   // A10：清 device 残留
          db.deleteSetting(K_DEVICE_EXPIRES);
          service.clearCache();
          sendJson(rctx.res, HTTP.OK, { ok: true });
          return;
        }

        // GET /repos/:owner/:repo/events（单仓动态；TTL 缓存已在 service.repoEvents 内；窗口用三级取值后的 statsWindowDays）
        const evM = sub.match(new RegExp(`^${R_SUB_REPOS}/([^/]+)/([^/]+)/events/?$`));
        if (evM && rctx.req.method === "GET") {
          void (async () => {
            try {
              const owner = decodeURIComponent(evM[1]);
              const repo = decodeURIComponent(evM[2]);
              const items = await service.repoEvents(owner, repo);
              // 下发统计窗口供前端拼文案（实际生效值，禁止前端写死 30）
              sendJson(rctx.res, HTTP.OK, { ok: true, items, statsWindowDays: thresholds().statsWindowDays });
            } catch (e) { sendJson(rctx.res, HTTP.BAD_GATEWAY, { ok: false, reason: (e as Error).message, items: [] }); }
          })();
          return;
        }

        // GET /repos（列表 + 提交频率 + 分区；聚合结果整体 TTL 缓存；?refresh=1 强刷；阈值三级取值后下发实际值）
        if ((sub === R_SUB_REPOS || sub === R_SUB_REPOS + "/") && rctx.req.method === "GET") {
          void (async () => {
            try {
              if (rctx.url.searchParams.get("refresh") === "1") service.clearCache(); // 强刷（含改阈值后 UI 触发）
              const aggKey = `repos:${service.tokenFingerprint()}`;
              const cached = service.cacheGet<any>(aggKey);
              if (cached) { sendJson(rctx.res, HTTP.OK, cached); return; }
              const th = thresholds();
              const repos = await service.listRepos();
              const withStats = repos.map((r) => ({ ...r, commits30d: 0, active: false, statsFailed: false }));
              // 逐仓并行拉 events，并发上限 REPO_PARALLEL；单仓失败跳过并标记 statsFailed
              const pool: Promise<void>[] = [];
              const queue = [...withStats];
              for (let i = 0; i < Math.min(REPO_PARALLEL, queue.length); i++) {
                pool.push((async () => {
                  for (;;) {
                    const item = queue.shift();
                    if (!item) return;
                    const [owner, repo] = item.full_name.split("/");
                    try {
                      const raw = await service.repoEvents(owner, repo);
                      const n = service.commitFrequency(raw, th.activeWindowDays);
                      const m = service.commitFrequency(raw, th.statsWindowDays);
                      item.commits30d = m;
                      item.active = n >= th.activeMinCommits; // 活跃判据：≥（近 active_window_days 天，三级取值后实际值）
                    } catch { item.statsFailed = true; }
                  }
                })());
              }
              await Promise.all(pool);
              // 活跃区、尘封区各自按提交数降序；活跃区在上
              const active = withStats.filter((r) => r.active).sort((a, b) => b.commits30d - a.commits30d);
              const dusty = withStats.filter((r) => !r.active).sort((a, b) => b.commits30d - a.commits30d);
              const payload = {
                ok: true, connected: true,
                repos: [...active, ...dusty],
                activeCount: active.length,
                dustyCount: dusty.length,
                // 下发三级取值后的实际生效值，前端据此动态拼「近 N 天提交 ≥ M 为活跃」文案
                activeWindowDays: th.activeWindowDays,
                activeMinCommits: th.activeMinCommits,
                statsWindowDays: th.statsWindowDays,
              };
              service.cacheSet(aggKey, payload); // 聚合结果 TTL 缓存
              sendJson(rctx.res, HTTP.OK, payload);
            } catch (e) { sendJson(rctx.res, HTTP.BAD_GATEWAY, { ok: false, reason: (e as Error).message }); }
          })();
          return;
        }

        sendJson(rctx.res, HTTP.NOT_FOUND, { ok: false, reason: ERR_MSG_NOT_FOUND });
      },
    }));

    // --- 面板 / 导航卡：三个页面槽（含详情面板，见本次重写要点 A7）---
    disposers.push(slots.register("shell.primary", {
      id: SLOT_AUTH,
      label: TEXT_AUTH_TITLE,
      order: 10,
      payload: { kind: PANEL_KIND_AUTH, icon: "github", title: TEXT_AUTH_TITLE, desc: TEXT_AUTH_DESC, route: HASH_AUTH },
    }));
    disposers.push(slots.register("shell.nav", {
      id: SLOT_AUTH_NAV,
      label: TEXT_AUTH_TITLE,
      order: 10,
      payload: { kind: "nav-card", icon: "github", desc: TEXT_AUTH_NAV_DESC, hash: "#" + HASH_AUTH, orderHint: 10 },
    }));
    disposers.push(slots.register("shell.primary", {
      id: SLOT_REPOS,
      label: TEXT_REPOS_TITLE,
      order: 20,
      payload: { kind: PANEL_KIND_REPOS, icon: "git", title: TEXT_REPOS_TITLE, desc: TEXT_REPOS_DESC, route: HASH_REPOS },
    }));
    // A13：仓库 nav 卡 icon 用 settings（onboarding icons map 只有 github/settings/feed/help，无 repo，避免 fallback 成 help）
    disposers.push(slots.register("shell.nav", {
      id: SLOT_REPOS_NAV,
      label: TEXT_REPOS_TITLE,
      order: 20,
      payload: { kind: "nav-card", icon: "settings", desc: TEXT_REPOS_NAV_DESC, hash: "#" + HASH_REPOS, orderHint: 20 },
    }));
    // 详情面板：route=repo；缺失则 #repo?name=… 在 renderPrimary 中无匹配项，永不渲染（A7）
    disposers.push(slots.register("shell.primary", {
      id: SLOT_DETAIL,
      label: TEXT_DETAIL_TITLE,
      order: 30,
      payload: { kind: PANEL_KIND_DETAIL, title: TEXT_DETAIL_TITLE, desc: TEXT_DETAIL_DESC, route: HASH_REPO },
    }));

    return () => {
      for (const off of disposers.reverse()) try { off(); } catch { /* noop */ }
      if (ctx.has("github")) (ctx as any).unprovide?.("github");
    };
  }
}

export const PLUGIN = new GithubPlugin();
```

注：`slots.register("shell.primary", … route:"repo")` 会让壳顶栏多出「仓库动态」链接（ide-view `mkHeader` 遍历所有 shell.primary 的 `payload.route`），点击进入 `#repo`（无 name）时详情面板显示「缺少仓库名」提示——属可接受副作用。

- [ ] **Step 6: 构建 + 类型检查**

Run: `pnpm --filter @vibepm/plugin-github run build`
Expected: 无 TS 错误，产出 dist + client-dist。随后：
Run: `pnpm run lint`
Expected: 通过。

- [ ] **Step 7: 提交**

```bash
git add packages/plugin-github
git commit -m "feat(github): Node 侧常量唯一源 + 认证三源解析 + github service 增强 + status/login/logout/分区 API + 阈值三级可配 + 三页面槽"
```

---

### Task 4: Device Flow API（start / poll）

**Files:**
- Modify: `packages/plugin-github/src/index.ts`

- [ ] **Step 1: 在 handler 内加 /device/start 与 /device/poll 分支**

在 `/api/github` handler 内、`/repos` 分支之前插入（常量：端点 URL / grant_type / scope / 状态码 / 错误信息均来自 `src/constants.ts`）：

```ts
        // POST /device/start —— 发起 Device Flow
        if ((sub === R_SUB_DEVICE_START || sub === R_SUB_DEVICE_START + "/") && rctx.req.method === "POST") {
          void (async () => {
            try {
              const clientId = cfg.client_id ?? "";
              if (!clientId) {
                sendJson(rctx.res, HTTP.BAD_REQUEST, { ok: false, reason: ERR_MSG_DEVICE_CLIENT_ID });
                return;
              }
              const r = await fetch(GH_DEVICE_CODE_URL, {
                method: "POST",
                headers: { "Accept": JSON_ACCEPT, "Content-Type": JSON_CONTENT_TYPE },
                body: JSON.stringify({ client_id: clientId, scope: GH_SCOPE }),
              });
              const d = await r.json() as any;
              if (d.error) { sendJson(rctx.res, HTTP.BAD_GATEWAY, { ok: false, reason: d.error_description ?? d.error }); return; }
              // 存 device_code / expires 供 poll
              db.setSetting(K_DEVICE_CODE, String(d.device_code ?? ""));
              db.setSetting(K_DEVICE_EXPIRES, String(Date.now() + (Number(d.expires_in ?? DEVICE_EXPIRES_IN_S) * 1000)));
              sendJson(rctx.res, HTTP.OK, {
                ok: true,
                user_code: d.user_code,
                verification_uri: d.verification_uri,
                expires_in: d.expires_in,
                interval: d.interval ?? DEVICE_POLL_INTERVAL_S,
              });
            } catch (e) { sendJson(rctx.res, HTTP.BAD_GATEWAY, { ok: false, reason: (e as Error).message }); }
          })();
          return;
        }

        // POST /device/poll —— 轮询授权状态
        if ((sub === R_SUB_DEVICE_POLL || sub === R_SUB_DEVICE_POLL + "/") && rctx.req.method === "POST") {
          void (async () => {
            try {
              const clientId = cfg.client_id ?? "";
              const deviceCode = db.getSetting<string>(K_DEVICE_CODE);
              if (!clientId || !deviceCode) { sendJson(rctx.res, HTTP.BAD_REQUEST, { ok: false, status: "no_pending" }); return; }
              const expires = Number(db.getSetting<string>(K_DEVICE_EXPIRES) ?? 0);
              if (expires && Date.now() > expires) { sendJson(rctx.res, HTTP.OK, { ok: false, status: "expired" }); return; }
              const r = await fetch(GH_ACCESS_TOKEN_URL, {
                method: "POST",
                headers: { "Accept": JSON_ACCEPT, "Content-Type": JSON_CONTENT_TYPE },
                body: JSON.stringify({
                  client_id: clientId,
                  device_code: deviceCode,
                  grant_type: DEVICE_GRANT_TYPE,
                }),
              });
              const d = await r.json() as any;
              if (d.access_token) {
                db.deleteSetting(K_DEVICE_CODE);
                db.deleteSetting(K_DEVICE_EXPIRES);
                db.setSetting(K_TOKEN, String(d.access_token));
                db.setSetting(K_SOURCE, "device");
                db.setSetting(K_USERNAME, String((await service.me())?.login ?? ""));
                service.clearCache();
                sendJson(rctx.res, HTTP.OK, { ok: true, connected: true });
                return;
              }
              if (d.error === "authorization_pending" || d.error === "slow_down") { sendJson(rctx.res, HTTP.OK, { ok: false, status: "pending" }); return; }
              if (d.error === "expired_token") { sendJson(rctx.res, HTTP.OK, { ok: false, status: "expired" }); return; }
              if (d.error === "access_denied") { sendJson(rctx.res, HTTP.OK, { ok: false, status: "denied" }); return; }
              sendJson(rctx.res, HTTP.OK, { ok: false, status: "error", reason: d.error_description ?? d.error });
            } catch (e) { sendJson(rctx.res, HTTP.BAD_GATEWAY, { ok: false, status: "error", reason: (e as Error).message }); }
          })();
          return;
        }
```

- [ ] **Step 2: 构建 + 提交**

Run: `pnpm --filter @vibepm/plugin-github run build`
Run: `pnpm run lint`
Expected: 无错误。

```bash
git add packages/plugin-github
git commit -m "feat(github): Device Flow 授权（start/poll，client_id 可配置）"
```

---

### Task 5: 仓库列表聚合 API（提交频率 + 分区 + 阈值三级）—— 已在 Task 3 Step 5 实现

> 说明：`/repos` 聚合（逐仓并行 events + commitFrequency + 活跃/尘封分区 + 聚合缓存 + 阈值三级取值下发）已在 Task 3 Step 5 的代码中实现，无需额外 Task 改动。此处仅确认分区判据与取值链路：`active = 近 active_window_days(默认 30，三级取值) 天提交数 >= active_min_commits(默认 60，三级取值)`（**注意是 ≥**）；列表行展示 `commits30d`（近 `stats_window_days`(默认 30，三级取值) 天）。

- [ ] **Step 1: 自查上述代码存在且字段一致**

确认 `src/index.ts` 含 `thresholds()` 三级取值函数与 `/repos` 分支（pool 并发 `REPO_PARALLEL` + active/dusty 分组 + `repos: [...active, ...dusty]` + 聚合缓存 `repos:<fp>` + 下发三级取值后的 `activeWindowDays`/`activeMinCommits`/`statsWindowDays`）。字段名 `commits30d`、`active`、`statsFailed`、`activeCount`、`dustyCount` 前后一致；`active = n >= th.activeMinCommits`（≥）。

---

### Task 6: Client 三面板 + 路由守卫 + render 注册 + 「分区设置」UI（含常量与文案集中）

**Files:**
- Create: `packages/plugin-github/client/constants.ts`
- Create: `packages/plugin-github/client/components.ts`
- Modify: `packages/plugin-github/client/index.ts`
- Modify: `packages/plugin-github/client/types.d.ts`

- [ ] **Step 1: 写 client/constants.ts（client 侧常量 + 文案唯一源 + 语言色 + settings 键副本）**

client 是 esbuild 独立 bundle（`--external:@vibepm/*`），不跨包 import node 常量；与 `src/constants.ts` / `src/settings-keys.ts` 共享语义的值两端各存一份、**必须保持一致（修改时同步）**。**A17：阈值兜底常量、settings 阈值键副本、TEXT 新增「分区设置」文案**：

```ts
// Client 侧常量：UI 文案（TEXT）+ 语言色 + 与 src/constants.ts / src/settings-keys.ts 共享语义的副本。
// 注意 与 node 端共享语义的值（API_PREFIX / HASH_* / PANEL_KIND_* / SHORT_SHA_LEN / DAY_MS /
//   EVENT_TYPE_* / 阈值兜底 / settings 阈值键）：两端各一份，内容必须保持一致（修改时同步）。
// 注：client 为 esbuild 独立 bundle（--external:@vibepm/*），不跨包 import node 常量。

export const API_PREFIX = "/api/github";
export const HASH_AUTH = "auth";
export const HASH_REPOS = "repos";
export const HASH_REPO = "repo";
export const PANEL_KIND_AUTH = "github-auth-panel";
export const PANEL_KIND_REPOS = "github-repos-panel";
export const PANEL_KIND_DETAIL = "github-repo-detail-panel";
export const SHORT_SHA_LEN = 7;
export const DAY_MS = 86_400_000;
export const DEVICE_POLL_INTERVAL_S = 5;   // 与 node 同值：轮询间隔兜底
export const GH_WEB_BASE = "https://github.com";

// 阈值兜底（主路径以后端 /repos 下发的 activeWindowDays/activeMinCommits/statsWindowDays 实际生效值为准；
// 以下仅为防御性兜底，与 node 默认值一致，禁止散落写死 30/60）
export const ACTIVE_WINDOW_DAYS = 30;
export const ACTIVE_MIN_COMMITS = 60;
export const STATS_WINDOW_DAYS = 30;

// settings 阈值键副本（与 node src/settings-keys.ts 同步；client 保存「分区设置」时 POST /api/settings {batch} 用）
export const K_ACTIVE_WINDOW_DAYS = "github.active_window_days";
export const K_ACTIVE_MIN_COMMITS = "github.active_min_commits";

export const EVENT_TYPE_PUSH = "PushEvent";
export const EVENT_TYPE_PULL_REQUEST = "PullRequestEvent";
export const EVENT_TYPE_ISSUES = "IssuesEvent";
export const EVENT_TYPE_RELEASE = "ReleaseEvent";
export const EVENT_TYPE_WATCH = "WatchEvent";
export const EVENT_TYPE_FORK = "ForkEvent";
export const EVENT_TYPE_CREATE = "CreateEvent";
export const EVENT_TYPE_STAR = "StarEvent";

// 语言色唯一源（GitHub linguist 近似色；仅此处允许字面量色值）
export const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Go: "#00ADD8",
  Rust: "#dea584",
  "C++": "#f34b7d",
  Shell: "#89e051",
};
export const LANG_COLOR_DEFAULT = "#9aa0a7";

// 用户可见文案唯一源（node 端槽位文案在 src/constants.ts，两端口径一致）。
// 可配置阈值一律由后端下发实际生效值动态拼接，禁止把 30/60 写死进文案。
export const TEXT = {
  // #auth
  authTitle: "连接 GitHub",
  authDesc: "gh CLI 直连 / Device Flow / PAT 三源。只读自己仓库动态，不做拉取推送。",
  statusReading: "读取中…",
  statusConnected: (source: string): string => `已连接 · ${source}`,
  statusDisconnected: "未连接",
  statusQueryFailed: "查询失败",
  meCard: (name: string, username: string, source: string): string => `${name} (@${username}) · 来源 ${source}`,
  btnLogout: "退出",
  btnSwitch: "切换账号",
  deviceSection: "浏览器授权（Device Flow）",
  deviceHint: "点下方按钮开始，浏览器打开后输入授权码。",
  btnDevice: "通过浏览器授权",
  openAuthPage: (uri: string): string => `打开授权页：${uri}`,
  patSection: "手动 Token（兜底）",
  patToggle: "显示 / 隐藏手动表单",
  labelUsername: "GitHub 用户名",
  labelToken: "Personal Access Token (classic)",
  btnConnect: "连接",
  msgLoginRequired: "请填用户名 + token",
  msgConnecting: "连接中…",
  msgConnected: "连接成功",
  msgLoginFailed: "连接失败",
  msgDeviceFailed: "启动失败",
  msgDeviceWaiting: "等待授权…",
  msgDeviceOk: "授权成功",
  msgDeviceDenied: "已拒绝授权",
  msgDeviceExpired: "授权码过期",
  // #repos
  reposTitle: "我的仓库",
  reposLoading: "加载中…",
  reposDesc: (total: number, active: number, dusty: number, windowDays: number, minCommits: number): string =>
    `共 ${total} 个 · 活跃 ${active} · 尘封 ${dusty} · 近 ${windowDays} 天提交 ≥ ${minCommits} 为活跃`,
  btnRefresh: "刷新",
  zoneActive: "活跃区",
  zoneDusty: "尘封区",
  archived: " (归档)",
  privateRepo: " (私有)",
  commitCount: (n: number, days: number): string => `提交 ${n} / ${days}d`,
  statsFailed: "统计失败",
  // #repos 分区设置（A17：轻量可折叠小区块，保存走通用 /api/settings {batch}，立即生效）
  zoneSettings: "分区设置",
  settingsHint: "改阈值后点保存，列表按新值立即重新分区。",
  labelWindowDays: "窗口天数（天）",
  labelMinCommits: "活跃提交数（次）",
  btnSaveSettings: "保存",
  msgSettingsSaved: "已保存，列表已刷新",
  msgSettingsFailed: "保存失败",
  // #repo
  detailTitle: "仓库动态",
  detailLoading: "加载中…",
  detailMissing: "缺少仓库名。",
  openLink: "打开 ↗",
  detailDesc: (commits: number, days: number, events: number): string => `近 ${days} 天提交 ${commits} 次 · 共 ${events} 条事件`,
  emptyEvents: "（近期无动态）",
  // timeline oneLine
  oneLinePush: (n: number, head: string): string => `推送 ${n} 个提交${head ? " · " + head : ""}`,
  oneLinePr: (action: string, title: string): string => `PR ${action} · ${title}`,
  oneLineIssue: (action: string, title: string): string => `Issue ${action} · ${title}`,
  oneLineRelease: (tag: string): string => `发布 ${tag}`,
  oneLineWatch: "已关注（star）",
  oneLineFork: (full: string): string => `Fork 到 ${full}`,
  oneLineCreate: (refType: string, ref: string): string => `创建 ${refType}${ref ? " · " + ref : ""}`,
  oneLineStar: "已 star",
  // relTime 单位
  timeUnit: (n: number, u: string): string => `${n} ${u}前`,
  uSec: "秒",
  uMin: "分",
  uHour: "小时",
  uDay: "天",
} as const;
```

- [ ] **Step 2: 写 client/components.ts —— 三个 Web Component + 「分区设置」区块**

复用现有科研黄黑皮肤变量（`--ink/--dim/--line/--line-strong/--yellow/--panel/--panel-alt/--panel-dark/--bg-deep/--danger/--mono/--display-cjk/--radius`），Shadow DOM 隔离。**A5：所有纯字面量色值已改为主题变量**（已核实：`--bg2` 非真实 token，原 `var(--bg2,#16191c)` 改用 `--panel-alt` / `--bg-deep`；硬位移阴影色沿用皮肤层既定做法 `var(--bg-deep)`）。三个组件：

- `GithubAuthPanel`（改造旧 auth 面板）：未登录展示「连接状态 + Device Flow 区块（授权码 + verification_uri 链接 + 自动轮询）+ PAT 兜底折叠表单」；已登录只显示状态条（账号 + 来源 + 退出 + 切换）。
- `GithubReposPanel`：进入先守卫（GET /status，未连接 → `location.hash = "#auth"`）；连接后 GET /repos，顶部渲染**可折叠「分区设置」小区块（A17）**，下方活跃区 + 尘封区（默认折叠）；行含名称/描述/语言色点/star/fork/「提交 N / statsDaysd」/更新时间；**A8：行点击 → `location.hash = "#repo?name=" + encodeURIComponent(full_name)`**。分区文案由后端下发实际生效值动态拼接（`activeWindowDays`/`activeMinCommits`）。
- `GithubRepoDetailPanel`：从 `parseHash(location.hash).params.get("name")` 读 full_name（与壳 parseHash 逻辑一致）；守卫同上；GET `/repos/:owner/:repo/events` 渲染 meta 条 + 动态 timeline（push 展开 commit subject 列表：短 sha 7 位 + 标题，无 diff）。

完整代码（一个文件，三组件 + 分区设置）：

```ts
// 面板三件套：认证 / 仓库列表（含分区设置）/ 仓库详情（科研黄黑皮肤，Shadow DOM；色值全部走主题变量）
import {
  API_PREFIX, HASH_AUTH, HASH_REPO, SHORT_SHA_LEN, DAY_MS, DEVICE_POLL_INTERVAL_S, GH_WEB_BASE,
  ACTIVE_WINDOW_DAYS, ACTIVE_MIN_COMMITS, STATS_WINDOW_DAYS,
  K_ACTIVE_WINDOW_DAYS, K_ACTIVE_MIN_COMMITS,
  EVENT_TYPE_PUSH, EVENT_TYPE_PULL_REQUEST, EVENT_TYPE_ISSUES, EVENT_TYPE_RELEASE,
  EVENT_TYPE_WATCH, EVENT_TYPE_FORK, EVENT_TYPE_CREATE, EVENT_TYPE_STAR,
  TEXT, LANG_COLORS, LANG_COLOR_DEFAULT,
} from "./constants.js";

// 色值全部为主题变量（shell.css :root 已定义）；圆角用 var(--radius)/var(--radius-s)；
// 字号/间距为结构性数值，集中在此 CSS 一处。
const CSS = /* css */`
:host{display:block}
h1{font-size:16px;letter-spacing:1.5px;color:var(--ink);margin:0 0 6px 0;font-weight:900;text-transform:uppercase;font-family:var(--display-cjk)}
.desc{font-size:12px;color:var(--dim);margin-bottom:16px;line-height:1.6}
.status{display:inline-block;padding:4px 9px;font:700 9px/1 var(--mono);letter-spacing:1px;border:1px solid var(--line-strong);color:var(--dim);margin-bottom:12px;text-transform:uppercase}
.status.on{color:var(--bg-deep);border-color:var(--yellow);background:var(--yellow);box-shadow:3px 3px 0 var(--bg-deep)}
.card{border:1px solid var(--line-strong);border-left:5px solid var(--yellow);background:var(--panel);color:var(--ink);padding:14px 16px;margin-bottom:14px;border-radius:var(--radius);box-shadow:4px 5px 0 var(--bg-deep)}
.form{border:1px dashed var(--line);border-left:3px solid var(--yellow);background:var(--panel-alt);padding:14px 16px;margin-top:8px;border-radius:var(--radius)}
label{font-size:10px;color:var(--dim);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:6px;font-family:var(--mono)}
input[type=text],input[type=password],input[type=number]{width:100%;background:var(--bg-deep);border:1px solid var(--line);border-left:3px solid var(--line-strong);color:var(--ink);font-family:var(--mono);font-size:12px;padding:8px 10px;border-radius:var(--radius-s)}
button{border:1px solid var(--line-strong);border-left:3px solid var(--line-strong);background:var(--panel-dark);color:var(--ink);padding:7px 14px;cursor:pointer;font:700 11px/1 var(--display-cjk);letter-spacing:.5px;border-radius:var(--radius);box-shadow:2px 3px 0 var(--bg-deep);transition:color .18s,box-shadow .18s}
button:hover{border-color:var(--yellow);color:var(--yellow);box-shadow:3px 4px 0 var(--bg-deep)}
button.primary{border-color:var(--line-strong);border-left-color:var(--yellow)}
.hidden{display:none}
.msg{font-size:11px;margin-left:4px}.msg.ok{color:var(--yellow)}.msg.err{color:var(--danger)}
/* 列表 */
.zhead{display:flex;align-items:baseline;gap:8px;margin:18px 0 8px 0;padding-left:10px;border-left:3px solid var(--yellow);cursor:pointer}
.zhead h2{font-size:12px;color:var(--ink);margin:0;letter-spacing:1px;font-family:var(--mono)}
.zhead .cnt{font-size:11px;color:var(--dim);font-family:var(--mono)}
.repo{border:1px solid var(--line);background:var(--panel-alt);padding:10px 12px;margin-bottom:6px;cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;border-radius:var(--radius-s);transition:border-color .15s}
.repo:hover{border-color:var(--yellow)}
.repo .nm{font-size:12px;color:var(--ink);font-weight:700;font-family:var(--mono)}
.repo .ds{font-size:11px;color:var(--dim);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.repo .meta{font-size:11px;color:var(--dim);font-family:var(--mono);text-align:right}
.lang{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
/* timeline */
.tl{list-style:none;padding:0;margin:0;border-top:1px solid var(--line)}
.tl li{padding:10px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:start}
.tl .dot{width:30px;height:30px;border:1px solid var(--yellow);background:var(--bg-deep);display:flex;align-items:center;justify-content:center;color:var(--yellow)}
.tl .dot svg{width:13px;height:13px}
.tl h4{font-size:12px;color:var(--ink);margin:0 0 3px 0;font-weight:700;line-height:1.4;font-family:var(--display-cjk)}
.tl p{font-size:12px;color:var(--dim);margin:0;line-height:1.5}
.tl time{font-size:11px;color:var(--dim);letter-spacing:.5px;white-space:nowrap;font-family:var(--mono)}
.commit{font-family:var(--mono);font-size:11px;color:var(--dim);margin:2px 0 0 0;padding-left:10px;border-left:1px dashed var(--line)}
.commit b{color:var(--yellow);font-weight:600}
.empty{padding:24px;text-align:center;color:var(--dim);font-size:12px;border:1px dashed var(--line);background:var(--panel-alt);border-radius:var(--radius)}
`;

const ICONS: Record<string, string> = {
  push: `<path d="M3 12 h10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M11 7 l5 5 l-5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  pr: `<path d="M6 3 a2 2 0 1 0 0 4 2 2 0 0 0 0 -4 z"/><circle cx="18" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 7 v10 M10 10 h4 a4 4 0 0 1 4 4 v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  issue: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5 v5.5 M12 16.2 v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  release: `<path d="M12 3 v4 M12 17 v4 M5 9 l-3.5 -2 M22 9 l-3.5 -2 M5 15 l-3.5 2 M22 15 l-3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  star: `<path d="M12 3.5 l2.7 5.6 6.1.9 -4.4 4.3 1 6 -5.4 -2.9 -5.4 2.9 1 -6 -4.4 -4.3 6.1 -.9 z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`,
  fork: `<circle cx="6" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 7 v2 a2 2 0 0 0 2 2 h8 a2 2 0 0 0 2 -2 V7 M12 11 v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  create: `<path d="M12 3 v18 M3 12 h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  watch: `<circle cx="12" cy="12" r="2.2" fill="currentColor" opacity=".9"/><path d="M3 12 s3.5 -7 9 -7 9 7 9 7 -3.5 7 -9 7 -9 -7 -9 -7 z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  other: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
};

/** 相对时间（与壳无关，本地实现） */
function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(diff) || diff < 0) return "";
  if (diff < 60) return TEXT.timeUnit(Math.floor(diff), TEXT.uSec);
  if (diff < 3600) return TEXT.timeUnit(Math.floor(diff / 60), TEXT.uMin);
  if (diff < DAY_MS / 1000) return TEXT.timeUnit(Math.floor(diff / 3600), TEXT.uHour);
  if (diff < 30 * DAY_MS / 1000) return TEXT.timeUnit(Math.floor(diff / 86400), TEXT.uDay);
  return new Date(iso).toISOString().slice(0, 10);
}

/** 事件类型 → 图标名（事件枚举来自 client/constants.ts，与 node 同源口径） */
function classify(type: string): string {
  const map: Record<string, string> = {
    [EVENT_TYPE_PUSH]: "push",
    [EVENT_TYPE_PULL_REQUEST]: "pr",
    [EVENT_TYPE_ISSUES]: "issue",
    [EVENT_TYPE_RELEASE]: "release",
    [EVENT_TYPE_WATCH]: "watch",
    [EVENT_TYPE_FORK]: "fork",
    [EVENT_TYPE_CREATE]: "create",
    [EVENT_TYPE_STAR]: "star",
  };
  return map[type] ?? "other";
}

function oneLine(e: any): string {
  try {
    const p: any = e.payload ?? {};
    switch (e.type) {
      case EVENT_TYPE_PUSH: { const n = p.distinct_size ?? p.commits?.length ?? 0; const head = p.commits?.[0]?.message?.split("\n")[0] ?? ""; return TEXT.oneLinePush(n, head); }
      case EVENT_TYPE_PULL_REQUEST: return TEXT.oneLinePr(p.action ?? "", p.pull_request?.title ?? "");
      case EVENT_TYPE_ISSUES: return TEXT.oneLineIssue(p.action ?? "", p.issue?.title ?? "");
      case EVENT_TYPE_RELEASE: return TEXT.oneLineRelease(p.release?.tag_name ?? "");
      case EVENT_TYPE_WATCH: return TEXT.oneLineWatch;
      case EVENT_TYPE_FORK: return TEXT.oneLineFork(p.forkee?.full_name ?? "?");
      case EVENT_TYPE_CREATE: return TEXT.oneLineCreate(p.ref_type ?? "", p.ref ?? "");
      case EVENT_TYPE_STAR: return TEXT.oneLineStar;
      default: return e.type;
    }
  } catch { return e.type ?? ""; }
}

async function api<T = any>(p: string, m: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const r = await fetch(API_PREFIX + p, { method: m, headers: body ? { "Content-Type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  return await r.json();
}

/** 入口守卫：未连接强制跳 #auth（共享；hash 常量同源） */
async function guard(): Promise<{ connected: boolean }> {
  try {
    const r = await api<{ connected: boolean }>("/status");
    if (!r.connected) { location.hash = "#" + HASH_AUTH; return { connected: false }; }
    return { connected: true };
  } catch { location.hash = "#" + HASH_AUTH; return { connected: false }; }
}

/** 与壳（ide-view client）parseHash 逻辑一致 */
function parseHash(h: string): { route: string; params: URLSearchParams } {
  const clean = h.replace(/^#\/?/, "");
  const [route = "", raw = ""] = clean.split("?");
  return { route, params: new URLSearchParams(raw) };
}

// ============ 认证面板 ============
export class GithubAuthPanel extends HTMLElement {
  private timer: number | undefined;
  connectedCallback(): void { this.attachShadow({ mode: "open" }); void this.render(); }
  disconnectedCallback(): void { if (this.timer) window.clearInterval(this.timer); }
  private setMsg(text: string, kind: "ok" | "err" = "ok"): void {
    const el = this.shadowRoot!.getElementById("msg")!;
    el.className = "msg " + kind; el.textContent = text;
  }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style>
      <h1>${TEXT.authTitle}</h1>
      <p class="desc">${TEXT.authDesc}</p>
      <div><span class="status" id="st">${TEXT.statusReading}</span></div>
      <div id="meCard" class="card hidden">
        <div id="meText"></div>
        <div style="margin-top:10px;display:flex;gap:8px"><button id="btnLogout">${TEXT.btnLogout}</button><button id="btnSwitch">${TEXT.btnSwitch}</button></div>
      </div>
      <div id="authBox" class="form hidden">
        <h3 style="font:700 10px/1 var(--mono);color:var(--dim);letter-spacing:1.2px;text-transform:uppercase;margin:0 0 10px 0">${TEXT.deviceSection}</h3>
        <p class="desc" id="dInfo">${TEXT.deviceHint}</p>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
          <button id="btnDevice" class="primary">${TEXT.btnDevice}</button>
          <code id="dCode" style="font:700 18px/1 var(--mono);color:var(--yellow)"></code>
          <a id="dVuri" target="_blank" rel="noreferrer noopener" style="display:none;color:var(--yellow);font-size:12px"></a>
        </div>
        <h3 style="font:700 10px/1 var(--mono);color:var(--dim);letter-spacing:1.2px;text-transform:uppercase;margin:14px 0 10px 0">${TEXT.patSection}</h3>
        <div class="hidden" id="patBox">
          <label>${TEXT.labelUsername}</label><input id="u" type="text" autocomplete="username" spellcheck="false"/>
          <label style="margin-top:10px">${TEXT.labelToken}</label><input id="t" type="password" autocomplete="new-password" spellcheck="false"/>
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button id="btnLogin" class="primary">${TEXT.btnConnect}</button><span class="msg" id="msg"></span></div>
        </div>
        <button id="btnPat" style="margin-top:10px">${TEXT.patToggle}</button>
      </div>`;
    s.getElementById("btnLogin")!.addEventListener("click", () => void this.login());
    s.getElementById("btnLogout")!.addEventListener("click", () => void this.logout());
    s.getElementById("btnSwitch")!.addEventListener("click", () => { (s.getElementById("authBox") as HTMLElement).classList.remove("hidden"); (s.getElementById("meCard") as HTMLElement).classList.add("hidden"); });
    s.getElementById("btnDevice")!.addEventListener("click", () => void this.deviceStart());
    s.getElementById("btnPat")!.addEventListener("click", () => { (s.getElementById("patBox") as HTMLElement).classList.toggle("hidden"); });
    await this.refresh();
  }
  private async refresh(): Promise<void> {
    const s = this.shadowRoot!;
    const st = s.getElementById("st")!;
    st.className = "status"; st.textContent = TEXT.statusReading;
    try {
      const r = await api<{ connected: boolean; source?: string; username?: string; me?: any }>("/status");
      if (r.connected) {
        st.className = "status on"; st.textContent = TEXT.statusConnected(r.source ?? "");
        (s.getElementById("meCard") as HTMLElement).classList.remove("hidden");
        (s.getElementById("authBox") as HTMLElement).classList.add("hidden");
        s.getElementById("meText")!.textContent = TEXT.meCard(r.me?.name ?? r.username ?? "", r.username ?? "", r.source ?? "");
      } else {
        st.textContent = TEXT.statusDisconnected;
        (s.getElementById("meCard") as HTMLElement).classList.add("hidden");
        (s.getElementById("authBox") as HTMLElement).classList.remove("hidden");
      }
    } catch (e) { st.textContent = TEXT.statusQueryFailed; this.setMsg((e as Error).message, "err"); }
  }
  private async login(): Promise<void> {
    const s = this.shadowRoot!;
    const u = (s.getElementById("u") as HTMLInputElement).value.trim();
    const t = (s.getElementById("t") as HTMLInputElement).value.trim();
    if (!u || !t) { this.setMsg(TEXT.msgLoginRequired, "err"); return; }
    this.setMsg(TEXT.msgConnecting, "ok");
    const r = await api<{ ok: boolean; reason?: string }>("/login", "POST", { username: u, token: t });
    if (r.ok) { this.setMsg(TEXT.msgConnected, "ok"); (s.getElementById("t") as HTMLInputElement).value = ""; await this.refresh(); }
    else this.setMsg(r.reason ?? TEXT.msgLoginFailed, "err");
  }
  private async logout(): Promise<void> {
    await api("/logout", "POST");
    await this.refresh();
  }
  private async deviceStart(): Promise<void> {
    const s = this.shadowRoot!;
    const r = await api<{ ok: boolean; reason?: string; user_code?: string; verification_uri?: string; interval?: number }>("/device/start", "POST");
    if (!r.ok) { this.setMsg(r.reason ?? TEXT.msgDeviceFailed, "err"); return; }
    s.getElementById("dCode")!.textContent = r.user_code ?? "";
    const a = s.getElementById("dVuri") as HTMLAnchorElement;
    a.href = r.verification_uri ?? ""; a.style.display = "inline";
    a.textContent = TEXT.openAuthPage(r.verification_uri ?? "");
    this.setMsg(TEXT.msgDeviceWaiting, "ok");
    const iv = (r.interval ?? DEVICE_POLL_INTERVAL_S) * 1000;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.devicePoll(), iv);
  }
  private async devicePoll(): Promise<void> {
    const r = await api<{ ok: boolean; status?: string }>("/device/poll", "POST");
    if (r.ok) { if (this.timer) window.clearInterval(this.timer); this.setMsg(TEXT.msgDeviceOk, "ok"); await this.refresh(); }
    else if (r.status === "expired" || r.status === "denied") {
      if (this.timer) window.clearInterval(this.timer);
      this.setMsg(r.status === "denied" ? TEXT.msgDeviceDenied : TEXT.msgDeviceExpired, "err");
    }
  }
}

// ============ 仓库列表面板（含「分区设置」小区块，A17） ============
export class GithubReposPanel extends HTMLElement {
  connectedCallback(): void { this.attachShadow({ mode: "open" }); void this.render(); }
  private async render(refresh = false): Promise<void> {
    const s = this.shadowRoot!;
    s.innerHTML = `<style>${CSS}</style><h1>${TEXT.reposTitle}</h1><p class="desc">${TEXT.reposLoading}</p>`;
    if (!(await guard()).connected) return;
    const r = await api<{ repos?: any[]; activeCount?: number; dustyCount?: number; activeWindowDays?: number; activeMinCommits?: number; statsWindowDays?: number }>(
      "/repos" + (refresh ? "?refresh=1" : ""),
    );
    const repos = r.repos ?? [];
    const active = repos.filter((x) => x.active);
    const dusty = repos.filter((x) => !x.active);
    // 阈值以后端下发的实际生效值为准（动态文案）；常量仅为防御性兜底
    const winDays = r.activeWindowDays ?? ACTIVE_WINDOW_DAYS;
    const minCommits = r.activeMinCommits ?? ACTIVE_MIN_COMMITS;
    const statsDays = r.statsWindowDays ?? STATS_WINDOW_DAYS;
    s.innerHTML = `<style>${CSS}</style>
      <h1>${TEXT.reposTitle}</h1>
      <p class="desc" id="desc">${TEXT.reposDesc(repos.length, active.length, dusty.length, winDays, minCommits)}</p>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><button id="reload" class="primary">${TEXT.btnRefresh}</button><span class="msg" id="msg"></span></div>
      <div class="zhead" data-z="settings"><h2>${TEXT.zoneSettings}</h2><span class="cnt"></span></div>
      <div class="zb form hidden" id="setBox">
        <p class="desc" style="margin-bottom:10px">${TEXT.settingsHint}</p>
        <label>${TEXT.labelWindowDays}</label><input id="winDays" type="number" min="1" step="1" value="${winDays}"/>
        <label style="margin-top:10px">${TEXT.labelMinCommits}</label><input id="minCommits" type="number" min="0" step="1" value="${minCommits}"/>
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button id="btnSaveSet" class="primary">${TEXT.btnSaveSettings}</button><span class="msg" id="setMsg"></span></div>
      </div>
      <div id="list"></div>`;
    s.getElementById("reload")!.addEventListener("click", () => void this.render(true));
    // A17：分区设置折叠 + 保存（通用 /api/settings {batch}，保存后 ?refresh=1 强刷绕过聚合缓存）
    s.querySelector<HTMLElement>(".zhead[data-z='settings']")!.addEventListener("click", () => {
      (s.getElementById("setBox") as HTMLElement).classList.toggle("hidden");
    });
    s.getElementById("btnSaveSet")!.addEventListener("click", () => void this.saveSettings(s));
    const list = s.getElementById("list")!;
    const zhead = (title: string, cnt: number, open: boolean) =>
      `<div class="zhead" data-z="${title}"><h2>${title}</h2><span class="cnt">${cnt}</span></div><div class="zb" ${open ? "" : "style='display:none'"}></div>`;
    const html: string[] = [];
    html.push(zhead(TEXT.zoneActive, active.length, true));
    for (const x of active) html.push(this.row(x, statsDays));
    html.push(zhead(TEXT.zoneDusty, dusty.length, false));
    for (const x of dusty) html.push(this.row(x, statsDays));
    list.innerHTML = html.join("");
    for (const z of list.querySelectorAll<HTMLElement>(".zhead")) {
      z.addEventListener("click", () => { const b = z.nextElementSibling as HTMLElement; b.style.display = b.style.display === "none" ? "" : "none"; });
    }
    // A8：仓库行点击 → hash 跳详情（与壳 hash 路由一致；不是 data-href 路径形式）
    for (const el of list.querySelectorAll<HTMLElement>(".repo")) {
      el.addEventListener("click", () => { location.hash = "#" + HASH_REPO + "?name=" + encodeURIComponent(el.dataset.repo ?? ""); });
    }
  }
  private async saveSettings(s: ShadowRoot): Promise<void> {
    const n = Number((s.getElementById("winDays") as HTMLInputElement).value);
    const m = Number((s.getElementById("minCommits") as HTMLInputElement).value);
    const msg = s.getElementById("setMsg")!;
    if (!Number.isFinite(n) || !Number.isFinite(m) || n < 1 || m < 0) {
      msg.className = "msg err"; msg.textContent = TEXT.msgSettingsFailed; return;
    }
    try {
      // 复用 settings 插件通用 KV API（POST /api/settings {batch}），不新造路由；阈值键常量同源于 client/constants.ts
      const rr = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: { [K_ACTIVE_WINDOW_DAYS]: n, [K_ACTIVE_MIN_COMMITS]: m } }),
      });
      const j = await rr.json();
      if (j?.ok === true) {
        msg.className = "msg ok"; msg.textContent = TEXT.msgSettingsSaved;
        await this.render(true); // 强刷：绕过 /repos 聚合 TTL 缓存，立即按新阈值重分区
      } else { msg.className = "msg err"; msg.textContent = TEXT.msgSettingsFailed; }
    } catch { msg.className = "msg err"; msg.textContent = TEXT.msgSettingsFailed; }
  }
  private row(x: any, statsDays: number): string {
    const lang = x.language ? `<span class="lang" style="background:${this.langColor(x.language)}"></span>${x.language}` : "";
    const desc = x.description ? `<div class="ds">${this.esc(x.description)}</div>` : "";
    const stats = x.statsFailed ? TEXT.statsFailed : TEXT.commitCount(x.commits30d ?? 0, statsDays);
    return `<div class="repo" data-repo="${this.esc(x.full_name ?? "")}">
      <div><div class="nm">${this.esc(x.name)}${x.archived ? TEXT.archived : ""}${x.private ? TEXT.privateRepo : ""}</div>${desc}</div>
      <div class="meta">${lang}</div>
      <div class="meta">★${x.stargazers_count ?? 0} ⑂${x.forks_count ?? 0}<br>${stats}<br>${relTime(x.updated_at ?? "")}</div>
    </div>`;
  }
  private esc(v: string): string { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string); }
  private langColor(l: string): string { return LANG_COLORS[l] ?? LANG_COLOR_DEFAULT; }
}

// ============ 仓库详情面板 ============
export class GithubRepoDetailPanel extends HTMLElement {
  connectedCallback(): void { this.attachShadow({ mode: "open" }); void this.render(); }
  private async render(): Promise<void> {
    const s = this.shadowRoot!;
    const name = parseHash(location.hash).params.get("name") ?? "";
    s.innerHTML = `<style>${CSS}</style><h1>${TEXT.detailTitle}</h1><p class="desc">${TEXT.detailLoading}</p>`;
    if (!(await guard()).connected) return;
    if (!name) { s.innerHTML = `<style>${CSS}</style><div class="empty">${TEXT.detailMissing}</div>`; return; }
    const [owner, repo] = name.split("/");
    const data = await api<{ items?: any[]; statsWindowDays?: number }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/events`);
    const items = data.items ?? [];
    const statsDays = data.statsWindowDays ?? STATS_WINDOW_DAYS;
    // 近 statsDays 天内的 push 提交数（distinct_size 累加，与列表口径一致；窗口由后端下发实际生效值）
    const cutoff = Date.now() - statsDays * DAY_MS;
    let commits = 0;
    for (const e of items) {
      if (e.type !== EVENT_TYPE_PUSH) continue;
      const at = Date.parse(e?.created_at ?? "");
      if (!Number.isFinite(at) || at < cutoff) continue;
      commits += Number(e?.payload?.distinct_size ?? 0) || 0;
    }
    s.innerHTML = `<style>${CSS}</style>
      <div style="display:flex;align-items:baseline;gap:10px"><h1>${this.esc(name)}</h1><a href="${GH_WEB_BASE}/${this.esc(name)}" target="_blank" rel="noreferrer noopener" style="color:var(--yellow);font-size:12px">${TEXT.openLink}</a></div>
      <p class="desc">${TEXT.detailDesc(commits, statsDays, items.length)}</p>
      <ul class="tl" id="tl"></ul>`;
    const ul = s.getElementById("tl")!;
    if (!items.length) { ul.innerHTML = `<div class="empty">${TEXT.emptyEvents}</div>`; return; }
    ul.innerHTML = items.map((e) => {
      const t = classify(e.type);
      const icon = ICONS[t] ?? ICONS.other;
      const commitsHtml = t === "push" && Array.isArray(e.payload?.commits)
        ? e.payload.commits.map((c: any) => `<p class="commit"><b>${this.esc(String(c.sha ?? "").slice(0, SHORT_SHA_LEN))}</b> ${this.esc((c.message ?? "").split("\n")[0])}</p>`).join("")
        : "";
      return `<li>
        <div class="dot"><svg viewBox="0 0 24 24" fill="currentColor">${icon}</svg></div>
        <div><h4><b style="color:var(--yellow)">${this.esc(e.actor?.login ?? "?")}</b> · ${this.esc(oneLine(e))}</h4>${commitsHtml}</div>
        <time>${relTime(e.created_at ?? "")}</time>
      </li>`;
    }).join("");
  }
  private esc(v: string): string { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string); }
}
```

- [ ] **Step 3: 改 client/index.ts（注册组件 + render 注册表）**

```ts
// 浏览器模块表由壳内核（ide-view client）构造到 window.__VIBEPM_MODULES__，插件不再 import 壳 URL
const modules = (window as any).__VIBEPM_MODULES__ as {
  register(id: string, factory: () => unknown): void;
};
import { GithubAuthPanel, GithubReposPanel, GithubRepoDetailPanel } from "./components.js";
import { PANEL_KIND_AUTH, PANEL_KIND_REPOS, PANEL_KIND_DETAIL } from "./constants.js";

modules.register("plugin-github", () => ({
  name: "plugin-github",
  inject: [],
  provide: [],
  apply(ctx: unknown) {
    if (!customElements.get(PANEL_KIND_AUTH)) customElements.define(PANEL_KIND_AUTH, GithubAuthPanel);
    if (!customElements.get(PANEL_KIND_REPOS)) customElements.define(PANEL_KIND_REPOS, GithubReposPanel);
    if (!customElements.get(PANEL_KIND_DETAIL)) customElements.define(PANEL_KIND_DETAIL, GithubRepoDetailPanel);
    // 面板注册：kind → 标签名（壳查 render 注册表渲染，不硬编码）
    try {
      const r = (ctx as any).services.get("render");
      r.register(PANEL_KIND_AUTH, PANEL_KIND_AUTH);
      r.register(PANEL_KIND_REPOS, PANEL_KIND_REPOS);
      r.register(PANEL_KIND_DETAIL, PANEL_KIND_DETAIL);
    } catch { /* noop */ }
  },
}));
```

- [ ] **Step 4: 更新 client/types.d.ts**

```ts
export {};
```

- [ ] **Step 5: 构建验证**

Run: `pnpm --filter @vibepm/plugin-github run build`
Run: `pnpm run lint`
Expected: 无 TS/构建错误，`client-dist/client.js` 产出。

- [ ] **Step 6: 提交**

```bash
git add packages/plugin-github
git commit -m "feat(github): client 三面板（认证/列表/详情）+ 路由守卫 + 分区设置 UI + render 注册 + 文案/语言色/常量集中"
```

---

### Task 7: 接入 runtime bundles + README 接入行（先删后建最后一步）

> Task 1 删旧后 minimal 无 github 插件；本 Task 把 `"plugin-github"` 插回 minimal（插在原 github-auth 的位置、settings 前），并在 README 补回 plugin-github 接入行，使 runtime 与 README 同步为最终态。build 全绿。

**Files:**
- Modify: `packages/cli/src/runtime.ts`
- Modify: `README.md`（补回 3 处 plugin-github 接入行）

- [ ] **Step 1: 改 DEFAULT_BUNDLES —— 把 plugin-github 插回 minimal**

`packages/cli/src/runtime.ts`：
```ts
export const DEFAULT_BUNDLES: Record<string, string[]> = {
  minimal: [
    "plugin-storage",
    "plugin-web-ui",
    "plugin-ide-view",
    "plugin-onboarding",
    "plugin-github",
    "plugin-settings",
    "plugin-plugin-manager",
    "plugin-ambient",
  ],
};
```
> `"plugin-github"` 插在 onboarding 之后、settings 之前（原 `plugin-github-auth` 的位置），顺序语义不变。

- [ ] **Step 2: 补 README 接入行（3 处，Task 1 删除处补回）**

1. 功能表补回（插在 Home 行后）：
   `| GitHub | \`#auth\` / \`#repos\` / \`#repo\` | plugin-github | 三源连接（gh / Device Flow / PAT）+ 仓库分区列表 + 仓库详情动态 |`
2. 包列表补回（替换原 github-auth 行的位置）：
   `| @vibepm/plugin-github | GitHub 连接 + 仓库动态（gh / Device Flow / PAT 三源） |`
3. minimal 数组行改回（补 `github` 占位）：
   `minimal = [storage | web-ui | ide-view | onboarding | github | settings | plugin-manager]`

- [ ] **Step 3: 全仓构建 + 残留复核**

Run: `pnpm install`
Run: `pnpm run build`
Expected: 全绿，plugin-github 已进 minimal bundle。复核：
Run: 使用 Grep 工具扫描（pattern `plugin-github-auth|plugin-repo-feed|/plugins/plugin-ide-view/module-system\.js`，path 覆盖 `packages`、`examples`、`README.md`、`task_plan.md`）
Expected: 无输出（旧两包 id / 壳 URL import 全部清零；`module-system.js` 仅以相对路径 `./module-system.js` 出现在壳自身 import，不匹配带 `/plugins/` 前缀的 URL pattern）。

- [ ] **Step 4: 提交**

```bash
git add packages/cli/src/runtime.ts README.md
git commit -m "feat(github): 接入 DEFAULT_BUNDLES.minimal 并更新 README 接入行"
```

---

### Task 8: 真机验收（用户规则：必须真机验证通过方可宣告可用）

**Files:** 无（仅验证）

前置：确认本机 git 仓库在 `main` 干净；如需 Device Flow，先在 GitHub 创建 OAuth App 拿公开 `client_id` 并配置到 `~/.vibepm/vibepm.json` 的 `github.client_id`。

- [ ] **Step 1: gh CLI 直连**

Run: 先 `pnpm --filter @vibepm/cli run build`，再 `vibepm web --next`（全局启动器 vibepm.cmd 指向 `packages/cli/dist/bin.js`）。确认本机 `gh auth status` 已登录。
Expected: 进 `#repos` 自动 connected（守卫放行，无跳转），列表出现分区（活跃区在上、尘封区默认折叠），行含「提交 N / 30d」，顶部文案为动态「近 30 天提交 ≥ 60 为活跃」（由 `/repos` 下发实际生效值拼成）。

- [ ] **Step 2: 分区正确性（默认阈值 60）**

Expected: **近 30 天提交 ≥ 60** 的仓库在活跃区、其余在尘封区（`>=` 边界：恰 60 次应为活跃）；提交数文案与实际 events 一致；点击尘封区头可展开；行点击进入 `#repo?name=owner/repo`（hash 路由，非路径）。

- [ ] **Step 3: 分区阈值可运行时修改（A17 验收）**

Expected: `#repos` 顶部「分区设置」区块（默认折叠）→ 展开 → 改「活跃提交数」为 5（或其它值）→ 点保存 → 提示「已保存，列表已刷新」→ 列表按新阈值立即重分区（desc 文案变为「近 30 天提交 ≥ 5 为活跃」）。重启 vibepm 后新值仍在（已持久化到 settings db，`GET /api/settings` 可见 `github.active_window_days` / `github.active_min_commits`）。改回默认可再保存恢复。

- [ ] **Step 4: 仓库详情 + commits**

Expected: `#repo?name=owner/repo` 正常渲染 meta 条 + 动态 timeline；push 事件展开 commit subject 列表（短 sha 7 位 + 标题），无文件 diff；PR/issue/release 正常渲染。

- [ ] **Step 5: 无 gh 场景 → Device Flow**

临时把 `gh` 从 PATH 移除或改名 → 进 `#repos` 被强制跳 `#auth` → 点「通过浏览器授权」→ 显示授权码 + 链接 → 浏览器授权 → 自动轮询成功 → 返回 `#repos` 正常。
Expected: 全程无手动填 token；授权后 `#auth` 只显示状态条（来源 device），表单折叠。

- [ ] **Step 6: PAT 兜底（scope 与代码同一常量源）**

Expected: `#auth` 展开手动表单，填 username + classic token，**scope = `GH_SCOPE`（`src/constants.ts` 常量值 `repo read:user read:org`，与 `/device/start` 的 scope 同一源，见 A15）** → 连接成功 → 列表/详情正常；状态条来源 pat。

- [ ] **Step 7: 退出与守卫复位**

Expected: `#auth` 点退出 → token/username/source/**device_code/device_expires** 全部清空（settings 表核对，A10）→ 再进 `#repos` 强制跳 `#auth`。

- [ ] **Step 8: 双皮肤渲染核对（CSS 改主题变量后新增验收）**

Expected: 默认科研黄黑皮肤下三面板可读（文字/边框/强调对比正常）；安装并启用 `plugin-skin-rhine` 后（`#plugins` 里开关）三面板自动换肤可读，无死黑/死白（色值全部走主题变量，A5）。

- [ ] **Step 9: 无残留与插件管理**

Expected: `#plugins` 列表只有 `plugin-github`（无 github-auth / repo-feed）；全仓无 `plugin-github-auth` / `plugin-repo-feed` / `/plugins/plugin-ide-view/module-system.js`（README/task_plan/examples/tsconfig references 已清理，A14）；服务日志无 webServer 路由冲突（`duplicate route` 报错）。

- [ ] **Step 10: 提交验收（如需）**

确认全部通过后：`git log --oneline` 呈现「Task 1 删除 + Task 2-7 新建/接入」的提交序列（先删后建）；向用户宣告可用。

---

## 影响面核对（对照设计文档 §5 + 本次整改 + 先删后建重排）

| 影响面 | 实现任务 |
| --- | --- |
| 1. 新建 packages/plugin-github | Task 2–6（含新增 src/constants.ts、src/settings-keys.ts、client/constants.ts） |
| 2. 删旧两目录（plugin-github-auth / plugin-repo-feed） | Task 1 Step 1（`git rm -r`，先删） |
| 3. runtime bundles：minimal 删旧两 id | Task 1 Step 2（只删不插） |
| 4. runtime bundles：minimal 插回 plugin-github | Task 7 Step 1（插回原 github-auth 位置、settings 前） |
| 5. README.md | Task 1 Step 3（删 6 处旧引用）+ Task 7 Step 2（补回 3 处接入行） |
| 6. **vibepm-ts/task_plan.md（根目录，新增影响面）** | Task 1 Step 3（4 处残留：架构描述 16/17、任务表 4.3 行 34、任务 4.4 行 35、禁用示例行 93） |
| 7. examples/plugin-hello（壳 URL import + esbuild external） | Task 1 Step 3 |
| 8. tsconfig references 清理确认 | Task 1 Step 4（`plugin-repo-feed/tsconfig.json` 引 github-auth 随目录删除） |
| 9. pnpm-lock.yaml / pnpm install | Task 1 Step 5 |
| 10. 详情面板 slot 补注册（修复 #repo 永不渲染） | Task 3 Step 5（A7） |
| 11. **阈值三级可配（新增影响面）** | Task 3（`thresholds()` 三级取值 + /repos 下发实际值 + 单仓 events 下发 statsWindowDays）+ Task 6（「分区设置」UI + 保存 /api/settings {batch} + `?refresh=1` 强刷）；`/status` 不变 |
| 12. **防复制旧死链路（新增影响面）** | Task 2 开头显式说明（不复制 `ctx.on("web-api/route")` / 壳 URL import） |
| 13. onboarding | **不改**：仓库 nav 卡 icon 改用已存在的 `settings`（A13），不扩 icons map |
| 14. 旧遗留清理（死链路 / 壳 URL import 扫描） | Task 1 Step 6 + Task 7 Step 3 |

## 风险

- **先删后建中间态**：Task 1 后 minimal 无 github 插件、build 仍绿属**预期**，执行者勿误判为漏配；Task 7 才插回 `plugin-github`。
- **task_plan.md 清理遗漏**：该文件在 vibepm-ts 根目录（非 docs 下），上一轮清理范围漏了它；实际残留 4 处（含任务表 4.3 行 34，比"3 处"多一处），漏清会导致 Task 1 Step 6 扫描非 0。task_plan 行 145/203 的 `/plugins/plugin-ide-view/module-system.js` 属 P2/P3 已完成迁移的历史记录，不匹配扫描 pattern，不动。
- **防复制旧死链路**：旧两包已删，但 git 历史仍可 `git show` 取出旧代码；执行者若从历史拷贝，可能把 `ctx.on("web-api/route")` 或壳 URL import 复制进新插件。Task 2 开头显式声明防复制 + Task 8 Step 9 真机/扫描复核兜底。
- **阈值修改与聚合缓存**：`/repos` 聚合结果 TTL 缓存 key 是 `repos:<fp>`（不含阈值），改阈值后若直接 GET /repos 会命中旧缓存返回旧阈值。已设计「保存后 `GET /repos?refresh=1` 强刷」（A17）绕过；`thresholds()` 每次请求现算，settings 改动即时生效、无需重启。
- **阈值输入校验**：UI 数字输入需有限性/正数校验（client `saveSettings` 已含）；越界值后端 `??` 兜底回退配置/常量。
- Device Flow 需真实 OAuth App `client_id`；未配置时 start 返回明确提示，功能降级为 gh/PAT。
- GitHub Events API 90 天 / 300 条上限：提交数统计为「近 stats_window_days 天可见范围」，UI 文案由后端下发窗口实际生效值动态生成（"近 N 天提交"）。
- `/repos` 聚合 N+1 请求：并发 `REPO_PARALLEL`(5) + events TTL 缓存（key 含 token 指纹）+ `/repos` 聚合结果 TTL 缓存压限流；单仓失败跳过并标记 `statsFailed`；`?refresh=1` 强刷。
- gh CLI 每次 `/status` 实时解析：gh 未登录时开销可忽略；PAT/Device 走 settings。gh 登录状态下 PAT/Device 的 token 仍会存储，但三源解析优先 gh（与设计一致）。
- CSS 改主题变量后：需真机核对双皮肤（默认科研 + rhine）对比度（Task 8 Step 8）。
- README/task_plan/examples/tsconfig references 清理遗漏会导致残留引用（Task 1 Step 6 / Task 7 Step 3 扫描断言为 0）。
- 详情面板槽位注册使壳顶栏多出「仓库动态」链接（route `repo`，无 name 时显示缺仓名提示）——可接受副作用。
