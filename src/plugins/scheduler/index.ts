// scheduler 插件：定时触发 sync.run 事件（照 Python scheduler plugin.py；用 setInterval）
import type { Context } from "../../core/context.js";

export class SchedulerService {
  name = "scheduler";
  constructor(readonly scheduler: { stop: () => void }) {}
}

class SchedulerPlugin {
  name = "scheduler";
  provide = ["scheduler"];

  apply(ctx: Context): () => void {
    const cfg = ctx.mergedConfig("general");
    const intervalMin = Number(cfg.sync_interval_min ?? 60);
    const intervalMs = Math.max(intervalMin, 0.1) * 60_000;
    const handler = setInterval(() => ctx.emit("sync.run"), intervalMs);
    ctx.provide("scheduler", new SchedulerService({ stop: () => clearInterval(handler) }));
    return () => {
      try { clearInterval(handler); } catch { /* noop */ }
      if (ctx.has("scheduler")) ctx.unprovide("scheduler");
    };
  }
}

export const PLUGIN = new SchedulerPlugin();