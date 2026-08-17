// minimal-view 插件：订阅 repoStore.updated 事件（照 Python minimal_view plugin.py）
import type { Context } from "../../core/context.js";

class MinimalViewPlugin {
  name = "minimal-view";

  apply(ctx: Context): () => void {
    const onUpdated = () => undefined;
    const off = ctx.on("repoStore.updated", onUpdated);
    return off;
  }
}

export const PLUGIN = new MinimalViewPlugin();