/**
 * plugin-ambient: Node 端（占位）
 *  - 纯 client 插件：背景动画全在浏览器 canvas 算，Node 侧不需要提供服务/路由。
 *  - 保留 apply 空实现，满足两半式插件的 node 半形成（对齐 dsh，避免 loader 因缺 node 入口而 skip）。
 */
export class AmbientPlugin {
  name = "plugin-ambient";
  provide: string[] = [];
  inject: string[] = [];

  apply(_ctx: unknown): () => void {
    // 无 node 侧职责；一切渲染由 client 端完成
    return () => { /* noop */ };
  }
}

export const PLUGIN = new AmbientPlugin();