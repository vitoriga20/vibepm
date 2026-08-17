// Slots 服务：对齐 dsh runtime 的 SlotRegistry（简化版）
// 插件通过 slots.register(slotName, item) 向前端贡献 UI 内容；
// UI 插件（ide-view）读取 slots.render(slotName) 得到该 slot 所有条目顺序渲染。
import type { Context } from "./context.js";

export type Primitive = string | number | boolean | null | undefined;

/** 通用 slot item（JSON 可序列化，前端可直接消费） */
export interface SlotItem {
  /** 条目唯一 id（同 slot 内），用于去重和 dispose */
  id: string;
  /** 展示标题/标签 */
  label?: string;
  /** 排序权重，升序（小在前），默认 50 */
  order?: number;
  /** 图标名（前端自由约定图标集合） */
  icon?: string;
  /** 条目带的 payload（面板组件 id、属性等） */
  payload?: Record<string, Primitive | Primitive[] | Record<string, Primitive>>;
}

export type SlotName =
  // === dsh 风格 极简壳 4 个通用槽（本次新引入，作为主渲染槽）===
  | "shell.nav"           // 首页导航卡片区：onboarding / 快捷入口大卡（对应 dsh 首屏 2-3 张大卡）
  | "shell.primary"       // 主面板区：每个 item.payload.route 对应一个 hash 路由，例如 "settings" / "auth" / "feed"
  | "shell.secondary"     // 次面板区：放连接状态、提示、小工具（可空）
  | "shell.footer"        // 底栏：版本号、连接状态、路径（非必）
  // === 以下为旧 IDE 式槽位，后续迁移到 shell.* 后再删（暂保留，不影响极简壳渲染）===
  | "activity-bar"        // 左侧 Activity 图标栏条目
  | "sidebar-panels"      // 左侧侧边栏面板（对应 activity bar 选中时展开）
  | "main-tabs"           // 主编区顶部 tabs
  | "right-panels"        // 右侧面板
  | "topbar-menu"         // 顶部菜单项
  | "topbar-right"        // 顶部栏右侧（操作按钮区）
  | "statusbar-left"      // 底部状态栏左
  | "statusbar-right"     // 底部状态栏右
  | "editor-widgets";    // 主编辑区悬浮 widget

export interface SlotServiceShape {
  register(slot: SlotName, item: SlotItem): () => void;
  list(slot: SlotName): SlotItem[];
  snapshot(): Record<string, SlotItem[]>;
}

export class SlotService implements SlotServiceShape {
  static readonly NAME = "slots";
  private _store = new Map<SlotName, Map<string, SlotItem>>();

  register(slot: SlotName, item: SlotItem): () => void {
    let bucket = this._store.get(slot);
    if (!bucket) { bucket = new Map(); this._store.set(slot, bucket); }
    bucket.set(item.id, item);
    return () => {
      const b = this._store.get(slot);
      if (b) b.delete(item.id);
    };
  }

  list(slot: SlotName): SlotItem[] {
    const b = this._store.get(slot);
    if (!b) return [];
    const arr = [...b.values()];
    arr.sort((a, c) => (a.order ?? 50) - (c.order ?? 50));
    return arr;
  }

  snapshot(): Record<string, SlotItem[]> {
    const out: Record<string, SlotItem[]> = {};
    for (const k of this._store.keys()) out[k] = this.list(k);
    return out;
  }
}

/** 作为插件直接提供 slots 服务的入口 apply（loader 在 boot 早期挂载） */
export function slotsPlugin(): { name: string; provide: string[]; inject: string[]; apply(ctx: Context): () => void } {
  const provide = [SlotService.NAME];
  return {
    name: SlotService.NAME,
    provide,
    inject: [],
    apply(ctx: Context): () => void {
      ctx.provide(SlotService.NAME, new SlotService());
      return () => undefined;
    },
  };
}
