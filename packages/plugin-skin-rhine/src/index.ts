// plugin-skin-rhine Node 半：极简占位壳（对齐 dsh 两半式）。
// 皮肤本体是颜色 token，全部由 client 半向 :root 注入，Node 半不提供任何 service/路由。
import type { Context } from "@vitoriga20/core";

class SkinRhinePlugin {
  name = "plugin-skin-rhine";
  provide: string[] = [];
  inject: string[] = [];

  apply(_ctx: Context): () => void {
    // 无业务逻辑；皮肤即 CSS token，由 client 半注入。
    return () => undefined;
  }
}

export const PLUGIN = new SkinRhinePlugin();