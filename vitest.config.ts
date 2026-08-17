import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // NodeNext 源码 .js specifier → 解析到 .ts
    extensions: [".ts", ".js", ".mjs", ".cjs"],
    alias: [
      {
        find: /^\.\..*\.js$/,
        replacement: (match: string) => match.replace(/\.js$/, ".ts"),
      },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    server: {
      deps: {
        // 不内联 node: 内置模块
        external: [/node:/],
      },
    },
  },
});