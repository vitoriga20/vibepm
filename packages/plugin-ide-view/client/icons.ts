/**
 * Icons —— SVG line 几何（统一 24×24 viewBox，stroke currentColor，无 fill）。
 * 含蛇 logo 元素 + 用户风格约定的 line 几何三角形星等装饰。
 */

type IName =
  | "vibepm-logo"   // 蛇形 line 几何 logo
  | "explorer"      // 项目资源
  | "search"        // 搜索
  | "git"           // 同步 / 仓库
  | "checklist"     // 任务清单
  | "person"        // 账户
  | "link"          // 连接
  | "refresh"       // 同步（刷新）
  | "chevron-down"  // 折叠展开
  | "chevron-right"
  | "folder-closed"
  | "folder-open"
  | "file"
  | "close"
  | "plus"
  | "cross-star"    // 三角分布交叉星（装饰）
  // === 新增 dsh 极简 3 功能对应图标 ===
  | "settings"      // 齿轮
  | "github"        // GitHub 猫（简线）
  | "feed"          // 动态信号流
  | "plugins"       // 拼图/插件（plugin-manager 用）
  | "help";         // 帮助（onboarding 快速说明用）

/** 直接返回 SVG 字符串（innerHTML 可用），或者在 shadow DOM 里当 innerHTML。
 *  所有 icon 尺寸：宽度 100%；由父级定具体大小。
 */
export function iconSVG(name: IName): string {
  const c = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  switch (name) {
    case "vibepm-logo":
      return c(`
        <path d="M3 19 C 7 11, 10 5, 15 6 S 21 14, 15 20"/>
        <path d="M15 20 l -3 2 M 14 18 l 3 2"/>
        <circle cx="15" cy="6.5" r="0.9" fill="currentColor"/>
      `);
    case "explorer":
      return c(`
        <path d="M3 7 a2 2 0 0 1 2 -2 h4 l2 2 h8 a2 2 0 0 1 2 2 v9 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 z"/>
        <path d="M3 9 h18"/>
      `);
    case "search":
      return c(`
        <circle cx="11" cy="11" r="6.5"/>
        <path d="m16 16 l5 5"/>
      `);
    case "git":
      return c(`
        <circle cx="6" cy="6" r="2.2"/>
        <circle cx="6" cy="18" r="2.2"/>
        <circle cx="18" cy="12" r="2.2"/>
        <path d="M6 8.2 v7.6"/>
        <path d="M8.2 18 C 11 18, 14 12, 15.8 12"/>
      `);
    case "checklist":
      return c(`
        <path d="M4 6 h16 M4 12 h16 M4 18 h16"/>
        <path d="M4 6 l1.5 2 L8 5.5"/>
        <path d="M4 12 l1.5 2 L8 11.5"/>
        <path d="M4 18 l1.5 2 L8 17.5"/>
      `);
    case "person":
      return c(`
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 21 a8 8 0 0 1 16 0"/>
      `);
    case "link":
      return c(`
        <path d="M10 13 a5 5 0 0 0 7 0 l3 -3 a5 5 0 0 0 -7 -7 l-1.2 1.2"/>
        <path d="M14 11 a5 5 0 0 0 -7 0 l-3 3 a5 5 0 0 0 7 7 l1.2 -1.2"/>
      `);
    case "refresh":
      return c(`
        <path d="M20 13 a8 8 0 0 1 -13.3 5.7 L4 17"/>
        <path d="M4 13 a8 8 0 0 1 13.3 -5.7 L20 7"/>
        <path d="M4 17 v3 h3"/>
        <path d="M20 7 V4 h-3"/>
      `);
    case "chevron-down":
      return c(`<path d="M6 9 l6 6 l6 -6"/>`);
    case "chevron-right":
      return c(`<path d="M9 6 l6 6 l-6 6"/>`);
    case "folder-closed":
      return c(`
        <path d="M3 7 a2 2 0 0 1 2 -2 h4 l2 2 h8 a2 2 0 0 1 2 2 v9 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 z"/>
      `);
    case "folder-open":
      return c(`
        <path d="M3 7 a2 2 0 0 1 2 -2 h4 l2 2 h8 a2 2 0 0 1 2 2"/>
        <path d="M2.5 13 l1.8 -5.5 A2 2 0 0 1 6.2 6 h13.6 a2 2 0 0 1 1.9 1.5 L21.5 13 h-19 z"/>
      `);
    case "file":
      return c(`
        <path d="M6 3 h9 l4 4 v14 a1 1 0 0 1 -1 1 h-12 a1 1 0 0 1 -1 -1 z"/>
        <path d="M15 3 v4 h4"/>
        <path d="M8 13 h8 M8 16 h5"/>
      `);
    case "close":
      return c(`<path d="M6 6 l12 12 M18 6 L6 18"/>`);
    case "plus":
      return c(`<path d="M12 5 v14 M5 12 h14"/>`);
    case "cross-star":
      // 三角分布交叉星：6 尖小星
      return c(`
        <path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z"/>
      `);
    case "settings":
      return c(`
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15 a1.7 1.7 0 0 0 .3 1.8 l.1.1 a2 2 0 1 1 -2.8 2.8 l-.1-.1 a1.7 1.7 0 0 0 -1.8-.3 1.7 1.7 0 0 0 -1 1.5 V21 a2 2 0 1 1 -4 0 v-.1 a1.7 1.7 0 0 0 -1.1-1.5 1.7 1.7 0 0 0 -1.8.3 l-.1.1 a2 2 0 1 1 -2.8-2.8 l.1-.1 a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0 -1.5-1 H3 a2 2 0 1 1 0-4 h.1 a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0 -.3-1.8 l-.1-.1 a2 2 0 1 1 2.8-2.8 l.1.1 a1.7 1.7 0 0 0 1.8.3 H9 a1.7 1.7 0 0 0 1-1.5 V3 a2 2 0 1 1 4 0 v.1 a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3 l.1-.1 a2 2 0 1 1 2.8 2.8 l-.1.1 a1.7 1.7 0 0 0 -.3 1.8 V9 a1.7 1.7 0 0 0 1.5 1 H21 a2 2 0 1 1 0 4 h-.1 a1.7 1.7 0 0 0 -1.5 1 z"/>
      `);
    case "github":
      // 简化版 Octocat line 几何，无商标细节
      return c(`
        <path d="M9 19 c -4 1.2 -4 -2 -6 -2"/>
        <path d="M15 22 v -3.5 a3 3 0 0 0 -.8 -2.3 c 2.7 -.3 5.5 -1.3 5.5 -6 a4.6 4.6 0 0 0 -1.3 -3.2 4.3 4.3 0 0 0 -.1 -3.2 S17.3 3.7 15 5.3 a12 12 0 0 0 -6 0 C6.7 3.7 5.7 3.8 5.7 3.8 a4.3 4.3 0 0 0 -.1 3.2 A4.6 4.6 0 0 0 4.3 10.2 c0 4.6 2.8 5.7 5.5 6 a3 3 0 0 0 -.8 2.3 V22"/>
      `);
    case "feed":
      return c(`
        <path d="M4 11 a9 9 0 0 1 9 9"/>
        <path d="M4 4 a16 16 0 0 1 16 16"/>
        <circle cx="5" cy="19" r="1.4" fill="currentColor"/>
      `);
    case "plugins":
      return c(`
        <path d="M10 12 L4 9 a1.2 1.2 0 0 1 0 -2.1 L8 5.2"/>
        <path d="M10 12 V5.2 a1.2 1.2 0 0 0 -1.8 -1 L4 7"/>
        <path d="M14 12 l6 -3 a1.2 1.2 0 0 0 0 -2.1 L16 5.2"/>
        <path d="M14 12 V5.2 a1.2 1.2 0 0 1 1.8 -1 L20 7"/>
        <path d="M10 12 L4 15 a1.2 1.2 0 0 0 0 2.1 L8 18.8"/>
        <path d="M10 12 V18.8 a1.2 1.2 0 0 0 1.8 1 L14 17"/>
        <path d="M14 12 V18.8 a1.2 1.2 0 0 1 1.8 1 L20 16.5"/>
        <path d="M14 12 l6 3 a1.2 1.2 0 0 1 0 2.1 L16 19.5"/>
      `);
    case "help":
      return c(`
        <circle cx="12" cy="12" r="9"/>
        <path d="M9.5 9a2.5 2.5 0 0 1 4.8-.9c0 1.5-2.2 2-2.2 3.4"/>
        <circle cx="12" cy="16.5" r="1" fill="currentColor"/>
      `);
    default:
      return "";
  }
}

/** 便捷：创建 <i class="icon"> 元素 */
export function iconEl(name: IName, size = 18): HTMLElement {
  const i = document.createElement("i");
  i.className = "icon";
  i.style.width = `${size}px`;
  i.style.height = `${size}px`;
  i.style.display = "inline-block";
  i.innerHTML = iconSVG(name);
  return i;
}
