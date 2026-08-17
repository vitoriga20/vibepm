# vibepm (TS)

一切皆插件，用 Cordis 内核构建的个人 GitHub 项目管理器。零 Python，纯 TypeScript / Node。

## 一键使用

需先装 Node >= 22。

```bash
npx @vitoriga20/vibepm web
```

或从源码跑：

```bash
git clone https://github.com/vitoriga20/vibepm
cd vibepm
npm install && npm run build
node dist/bin.js web
```

## 命令

- `vibepm web` 启动本地服务并打开浏览器
- `vibepm setup` 初始化配置
- `vibepm sync` 手动同步 GitHub 数据
- `vibepm status` 查看配置状态

## 架构

`bin.ts` CLI 入口 · `cli/` commander 子命令 · `core/` Cordis 内核（context/fiber/services/eventbus/disposable/loader）· `plugins/` 插件（storage/github_source/scheduler/minimal_view/fields/web_ui）· `static/` web 前端 · `test/` node:test 单测

## 开发

```bash
npm install
npm run build
npm test
node dist/bin.js web --patch <config>.json
```

端口占用自动 failLoud 报错，可用 `web_ui.port=0` 分配动态端口。

## 发布

```bash
npm login
npm publish --access public
```

发布后 `npx @vitoriga20/vibepm web`（需 Node >= 22）。
