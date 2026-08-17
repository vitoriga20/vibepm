# vibepm

一切皆插件，用类 Cordis 内核构建的个人 GitHub 项目管理器。零 Python，纯 TypeScript / Node，pnpm workspaces monorepo。

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
node packages/cli/dist/bin.js web
```

## 命令

- `vibepm web` 启动本地服务并打开浏览器
- `vibepm setup` 初始化配置
- `vibepm sync` 手动同步 GitHub 数据
- `vibepm status` 查看配置状态

## 架构（monorepo）

pnpm workspaces 管理 `packages/*` 多包：

| 包 | 职责 |
| --- | --- |
| `@vibepm/cli` | CLI 入口（`bin.ts` / commander 子命令），对外暴露 `vibepm` 命令 |
| `@vibepm/core` | Cordis 类内核：context / fiber / services / eventbus / disposable / loader，外加 manifest / slots / client-modules |
| `@vibepm/plugin-storage` | SQLite 存储插件 |
| `@vibepm/plugin-web-ui` | HTTP 服务 + 静态前端，动态端口，静态资源经 `/plugins/*` 路由 |
| `@vibepm/plugin-ide-view` | IDE 风格 Web UI（Web Components + Shadow DOM），经 8 类 slot 渲染布局 |

SlotService 提供 8 类 UI 插槽：`activity-bar`、`sidebar-panels`、`main-tabs`、`right-panels`、`topbar-menu`、`topbar-right`、`statusbar-left`、`statusbar-right`。插件经 bundle 加载（`minimal = [storage | web-ui | ide-view]`）。

## 开发

```bash
pnpm install
pnpm run build
pnpm test
pnpm run lint
node packages/cli/dist/bin.js web --patch <config>.json
```

端口占用自动 failLoud 报错，可用 `web_ui.port=0` 分配动态端口。

## 发布

```bash
pnpm -r publish --access public
```

发布后 `npx @vitoriga20/vibepm web`（需 Node >= 22）。

## 设计风格

JetBrains Mono 等宽字体、4px 圆角、硬分隔线、单一深绿（#2ba77d）强调色，无渐变大阴影，蛇形几何线条元素。UI 为插件式注册进 slot，不改动外壳。