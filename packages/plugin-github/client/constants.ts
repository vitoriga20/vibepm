/**
 * plugin-github · client 常量单一源（不硬编码）
 *  - 与 node 侧 src/constants.ts / src/settings-keys.ts 共享语义的值，两端各存一份、保持一致。
 *  - 颜色：一律走壳主题 token（var(--accent) 等，穿透 Shadow DOM 跟随皮肤），本文件不出现色值字面量，
 *    唯一例外是业务映射 LANG_COLORS（GitHub 官方语言色，非主题色，属业务数据）。
 *  - 文案：全部集中在 TEXT，禁止散落在组件里。
 */

/** API 前缀（与 node 侧 /api/github 注册一致；node/client 口径同步） */
export const API_PREFIX = "/api/github";

/** hash 路由（与 node 侧 shell.primary payload.route 一致） */
export const HASH_AUTH = "auth";
export const HASH_REPOS = "repos";
export const HASH_REPO = "repo";

/** 面板 kind（壳 render 注册表键，与 custom element 名一致） */
export const PANEL_KIND_AUTH = "github-auth-panel";
export const PANEL_KIND_REPOS = "github-repos-panel";
export const PANEL_KIND_DETAIL = "github-repo-detail-panel";
export const PANEL_KIND_AVATAR = "github-avatar";

/** 分区阈值 settings 键（client 保存用，POST /api/settings {batch}；键名与 node 侧 settings-keys.ts 一致） */
export const K_ACTIVE_WINDOW_DAYS = "github.active_window_days";
export const K_ACTIVE_MIN_COMMITS = "github.active_min_commits";

/** 分区阈值兜底（主路径以后端 /repos 下发的 activeWindowDays/activeMinCommits/statsWindowDays 为准） */
export const ACTIVE_WINDOW_DAYS = 30;
export const ACTIVE_MIN_COMMITS = 60;
export const STATS_WINDOW_DAYS = 30;

/** Device Flow 轮询间隔兜底（秒；服务端下发的 interval 优先） */
export const DEVICE_POLL_INTERVAL_S = 5;

/** 时间常量 */
export const SEC = 1;
export const MIN = 60;
export const HOUR = 3600;
export const DAY = 86400;
export const MONTH = 30 * DAY;

/** 短 sha 长度 */
export const SHORT_SHA_LEN = 7;

/** 事件类型 → 图标名（node 侧 commitFrequency 亦判定 PushEvent，语义同源） */
export const EVENT_CLASSIFY: Record<string, string> = {
  PushEvent: "push",
  PullRequestEvent: "pr",
  IssuesEvent: "issue",
  ReleaseEvent: "release",
  WatchEvent: "watch",
  ForkEvent: "fork",
  CreateEvent: "create",
  StarEvent: "star",
};

/** 事件图标 SVG path（线性几何，与壳风格一致） */
export const ICONS: Record<string, string> = {
  push: `<path d="M3 12 h10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M11 7 l5 5 l-5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  pr: `<path d="M6 3 a2 2 0 1 0 0 4 2 2 0 0 0 0 -4 z"/><circle cx="18" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 7 v10 M10 10 h4 a4 4 0 0 1 4 4 v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  issue: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5 v5.5 M12 16.2 v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  release: `<path d="M12 3 v4 M12 17 v4 M5 9 l-3.5 -2 M22 9 l-3.5 -2 M5 15 l-3.5 2 M22 15 l-3.5 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  star: `<path d="M12 3.5 l2.7 5.6 6.1.9 -4.4 4.3 1 6 -5.4 -2.9 -5.4 2.9 1 -6 -4.4 -4.3 6.1 -.9 z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`,
  fork: `<circle cx="6" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 7 v2 a2 2 0 0 0 2 2 h8 a2 2 0 0 0 2 -2 V7 M12 11 v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  create: `<path d="M12 3 v18 M3 12 h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  watch: `<circle cx="12" cy="12" r="2.2" fill="currentColor" opacity=".9"/><path d="M3 12 s3.5 -7 9 -7 9 7 9 7 -3.5 7 -9 7 -9 -7 -9 -7 z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  other: `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
};

/** GitHub 语言 → 官方色（业务数据映射，非主题色；仅此表允许色值字面量） */
export const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Go: "#00ADD8",
  Rust: "#dea584",
  "C++": "#f34b7d",
  Shell: "#89e051",
};
/** 未收录语言 → 回落到主题 dim token（不写死色值，走 var(--dim)） */
export const LANG_COLOR_FALLBACK = "var(--dim)";

/** 相对时间单位文案 */
export const REL_UNITS: Array<{ step: number; label: string }> = [
  { step: MIN, label: "秒前" },
  { step: HOUR, label: "分钟前" },
  { step: DAY, label: "小时前" },
  { step: MONTH, label: "天前" },
  { step: Infinity, label: "" },
];

/** 用户可见文案（唯一源） */
export const TEXT = {
  auth: {
    title: "连接 GitHub",
    desc: "gh CLI 直连 / Device Flow / PAT 三源。只读自己仓库动态，不做拉取推送。",
    statusReading: "读取中…",
    statusConnected: "已连接 · 来源 ",
    statusOff: "未连接",
    statusFail: "查询失败",
    deviceTitle: "浏览器授权（Device Flow）",
    deviceDesc: "点下方按钮开始，浏览器打开后输入授权码。",
    deviceBtn: "通过浏览器授权",
    deviceOpen: "打开授权页 ↗",
    deviceWait: "等待授权…",
    devicePending: "等待授权…",
    deviceOk: "授权成功",
    deviceDenied: "已拒绝授权",
    deviceExpired: "授权码过期",
    deviceError: "授权失败",
    deviceStartFail: "启动失败",
    clientIdMissing: "未配置 client_id：请在配置 github.client_id 填 GitHub OAuth App 的公开 client_id",
    patTitle: "手动 Token（兜底）",
    patUsername: "GitHub 用户名",
    patToken: "Personal Access Token (classic)",
    patBtn: "连接",
    patToggle: "显示 / 隐藏手动表单",
    patNeedBoth: "请填用户名 + token",
    patConnecting: "连接中…",
    patOk: "连接成功",
    patFail: "连接失败",
    meCard: "来源 ",
    btnLogout: "退出",
    btnSwitch: "切换账号",
  },
  avatar: {
    title: "账号详情",
    src: "来源 ",
    settings: "设置 · 分区阈值",
    logout: "退出",
  },
  settings: {
    title: "分区设置",
    desc: "活跃 = 近 N 天提交 ≥ M 次，其余进尘封区。三级可配：settings(运行时) > vibepm.json(重启) > 默认。",
    winLabel: "活跃窗口（天）",
    minLabel: "活跃提交数（≥）",
    save: "保存",
    close: "关闭",
    saved: "已保存，正在刷新…",
    invalid: "请输入有效的数字",
  },
  repos: {
    title: "我的仓库",
    descActiveNote: "近 {window} 天提交 ≥ {min} 为活跃",
    loading: "加载中…",
    loadFail: "加载失败",
    reload: "刷新",
    sectionActive: "活跃区",
    sectionDusty: "尘封区",
    total: "共 ",
    sep: " · ",
    activeCount: "活跃 ",
    dustyCount: "尘封 ",
    commits: "提交 ",
    perDays: " / ",
    lastPush: "最近提交 ",
    archived: " (归档)",
    private: " (私有)",
    star: "★",
    fork: "⑂",
    empty: "暂无仓库",
  },
  detail: {
    title: "仓库动态",
    openGithub: "打开 GitHub ↗",
    emptyName: "缺少仓库名。",
    emptyEvents: "（近期无动态）",
    commits: "近 {window} 天提交 ",
    commitsTimes: " 次",
    events: "共 ",
    eventsCount: " 条事件",
    sep: " · ",
    push: "推送 ",
    pushCommits: " 个提交",
  },
  event: {
    push: "推送 ",
    pr: "PR ",
    issue: "Issue ",
    release: "发布 ",
    watch: "已关注（star）",
    fork: "Fork 到 ",
    create: "创建 ",
    star: "已 star",
    by: " · ",
  },
} as const;
