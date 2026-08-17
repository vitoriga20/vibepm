#!/usr/bin/env node
// vibepm CLI 入口 —— bin 指向 dist/bin.js
import { run } from "./cli/index.js";

run(process.argv.slice(2));