// CLI 入口（commander）
import { Command } from "commander";
import { web, setup, syncLocal, status } from "./commands.js";
import { runPlugin } from "./plugin.js";

export function run(argv = process.argv.slice(2)): void {
  const program = new Command();
  program.name("vibepm").description("一切皆插件，用 Cordis 内核重写的个人 GitHub 项目管理器").version("0.1.0");

  program
    .command("setup")
    .description("初始化：生成默认配置")
    .action(() => setup());

  program
    .command("web")
    .description("启动本地服务并自动打开浏览器")
    .option("--patch <file>", "临时配置覆盖 JSON")
    .action((opts: { patch?: string }) => void web(opts.patch));

  program
    .command("plugin")
    .description("管理第三方插件（转发给 pnpm，安装/更新/移除声明 vibepm.bundle 的组合层）")
    .allowExcessArguments(true)
    .allowUnknownOption(true)
    .argument("<pnpmArgs...>", "pnpm 参数，如 `add @my/plugin` / `remove @my/plugin`")
    .action((args: string[]): void => { process.exitCode = runPlugin(args); });

  program
    .command("sync")
    .description("手动同步 GitHub 数据")
    .action(() => syncLocal());

  program
    .command("status")
    .description("查看配置与状态")
    .action(() => status());

  program.parse(argv, { from: "user" });
}
