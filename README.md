# vibepm

一切皆插件，用类 Cordis 内核构建的个人 GitHub 项目管理器。零 Python，纯 TypeScript / Node，pnpm workspaces monorepo。

入口风格参考 dsh（DeepSeek Harness）：**极简壳 + 插件化核心功能**，无多余加载动画，冷启动加载。

## 一键使用

需先装 Node >= 22 与 pnpm。

```bash
npx @vitoriga20/vibepm web
```

或从源码跑：

```bash
git clone https://github.com/vitoriga20/vibepm
cd vibepm
pnpm install
pnpm run build
vibepm web
```

## 命令

- `vibepm setup` 初始化配置
- `vibepm web` 启动本地服务并打开浏览器
- `vibepm plugin <pnpm args...>` 管理三方插件（见「安装三方插件」）
- `vibepm sync` 手动同步 GitHub 数据（开发中）
- `vibepm status` 查看配置状态

> 历史遗留：早先的 Python 版 `vibepm` 曾以 `vibepm.exe` 形式存在于 anaconda，会在 PATH 抢占命令名。使用全局 `vibepm` 前请**删除 `anaconda3\Scripts\vibepm.exe`**（或改用 `npx`/源码启动）。项目内置了 [setup-global.ps1](setup-global.ps1) 可一键删除旧 exe 并 `npm link`。

## 极简界面（对齐 dsh）

首屏只有一个极简壳（`vibe-shell`），顶栏导航由 **shell 槽位驱动**（禁用插件后导航项与面板一起消失）。核心功能全部来自插件：

| 入口 | 路由 | 插件 | 功能 |
| --- | --- | --- | --- |
| Home | `/` | plugin-onboarding | 首屏引导大卡（连接 GitHub / 打开设置 / 查看动态） |
| GitHub | `#auth` | plugin-github | 三源连接（gh / Device Flow / PAT）+ 仓库分区列表 + 仓库详情 |
| Plugins | `#plugins` | plugin-plugin-manager | **设置里开关插件（冷启动生效）** |
| Settings | `#settings` | plugin-settings | 通用键值设置面板 |

开关插件：Settings → 插件（或顶栏 Plugins），列表一行一个插件 + 开关。开关写入本地 settings（`plugins.enabled`），**冷启动生效**——重启内核后该插件的界面与后端一起消失/恢复。内核三件套（Storage / Web UI / Shell）不可关。

## 架构（monorepo）

pnpm workspaces 管理 `packages/*` 多包：

| 包 | 职责 |
| --- | --- |
| `@vibepm/cli` | CLI 入口（commander 子命令），对外暴露 `vibepm` 命令 |
| `@vibepm/core` | Cordis 类内核：context / fiber / services / eventbus / loader / slots / manifest / client-modules |
| `@vibepm/plugin-storage` | SQLite 存储（项目 / 设置 key-value），提供 `db` 服务 |
| `@vibepm/plugin-web-ui` | HTTP 服务 + 静态壳，动态端口，`/api/*` 与 `/plugins/*` 路由 |
| `@vibepm/plugin-ide-view` | 极简壳 `vibe-shell`（Web Components + Shadow DOM），按 shell 槽渲染 |
| `@vibepm/plugin-onboarding` | 首屏引导导航卡 |
| `@vibepm/plugin-github` | GitHub 连接（gh / Device Flow / PAT 三源）+ 仓库分区列表 + 仓库详情，提供 `github` 服务 |
| `@vibepm/plugin-settings` | 通用设置面板 |
| `@vibepm/plugin-plugin-manager` | 插件开关面板 |

### Shell 槽位

`SlotService` 提供极简壳 4 类通用槽（旧 IDE 风格槽保留兼容，极简壳只用下列）：

- `shell.nav` — 首屏导航卡片区
- `shell.primary` — 主面板区（每个 item 的 `payload.route` 对应一个 hash 路由）
- `shell.secondary` — 状态 pill 区
- `shell.footer` — 底栏（版本号）

插件经 bundle 加载（`minimal = [storage | web-ui | ide-view | onboarding | github | settings | plugin-manager]`）。插件开关在启动时被读取，禁用的插件不加载。

## 插件开关的数据链路

- UI：`plugin-plugin-manager` 面板 → `POST /api/plugins/:name { enabled }`
- 持久化：写入 settings 键 `plugins.enabled`（`{name: bool}`）
- 生效：`loader.boot()` 读取该键，跳过失配插件的加载（对齐 dsh 的 profile user-layer patch）
- 保护：`PROTECTED_CORE`（storage / web-ui / ide-view）在 `/api/plugins` 标记 locked，后端拒绝关闭

## 安装三方插件

`vibepm plugin` 是一个薄转发器：把参数原样交给 pnpm，在全局插件目录 `~/.vibepm/plugins` 里执行，装完自动把「声明了 `vibepm.bundle` 的组合层插件」收进 layer 栈，下次启动 `vibepm web` 即生效。

```bash
# 从一个 npm 包安装（需已发布，含 vibepm.bundle 声明）
vibepm plugin add @my-org/my-plugin

# 从本地目录/git 安装
vibepm plugin add ../my-plugin
vibepm plugin add git+https://github.com/my-org/my-plugin.git

# 更新 / 移除
vibepm plugin update
vibepm plugin remove @my-org/my-plugin
```

### 第三方插件长什么样

一个可安装的三方插件包需在 `package.json` 声明两件事：

1. `vibepm.bundle.patch` —— 指向一个 patch 文件（默认 `./vibepm.patch.json`），描述它往内核组合里加了什么、覆盖了什么：

```json
{
  "name": "@my-org/my-plugin",
  "vibepm": {
    "bundle": { "patch": "./vibepm.patch.json" }
  }
}
```

2. patch 文件本身（JSON 数组，行语义）：

```json
[
  { "insert": [{ "id": "my-plugin", "name": "@my-org/my-plugin", "config": {} }] },
  { "id": "my-plugin", "config": { "fast": true } },
  { "id": "another-plugin", "disabled": true }
]
```

行语义：`insert` 插入新行；`id + config` 整体替换既有行配置；`id + disabled` 禁用行。未声明 `vibepm.bundle` 的依赖会被当成普通库安装，**不会**构成组合层。

> 提示：git 依赖的构建脚本会被 pnpm 阻断，把 pnpm 打印的条目加进 `~/.vibepm/plugins/pnpm-workspace.yaml` 的 `allowBuilds` 后重跑。
>
> 说明：patch 默认文件名是 `vibepm.patch.json`（JSON，少依赖）；若 `insert` 出未安装到插件目录的行，该插件会在启动时被安全跳过（进 skipped，不崩整链）。

## 开发

```bash
pnpm install
pnpm run build
pnpm test
node packages/cli/dist/bin.js web --patch <config>.json
```

端口占用自动 failLoud 报错，可用 `web_ui.port=0` 分配动态端口。

## 发布

```bash
pnpm -r publish --access public
```

发布后 `npx @vitoriga20/vibepm web`（需 Node >= 22）。

## 设计风格

对齐 dsh 极简：JetBrains Mono 等宽字体、细灰白 + 单一深绿（#2ba77d）强调、无多余加载动画。UI 全部由插件经 shell 槽注册，禁用某插件即整体消失，不改动外壳。