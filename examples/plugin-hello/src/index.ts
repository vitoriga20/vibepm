/**
 * plugin-hello · Node 半（第三方插件最小模板）
 *  - 只 demo 两半式：本文件是 node 半，apply 时打印（会被 loader 装配并 apply）。
 *  - 完全自包含：零 @vibepm 依赖（用 duck-typing 结构签名），因此第三方 clone 即用，无需 workspace。
 *  - 组合层通过 vibepm.bundle 声明（见 package.json / vibepm.patch.json）。
 */
export class HelloPlugin {
  name = "plugin-hello";
  provide: string[] = [];
  inject: string[] = [];

  apply(_ctx: unknown): () => void {
    console.warn("[plugin-hello] node-half applied · committed into shell ✓");
    return () => {
      console.warn("[plugin-hello] node-half disposed");
    };
  }
}

export const PLUGIN = new HelloPlugin();