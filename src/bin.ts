#!/usr/bin/env node
// vibepm CLI 入口 —— bin 指向 dist/bin.js（照 dsh apps/cli bin.ts）
import { run } from "./cli/index.js";

run(process.argv.slice(2));