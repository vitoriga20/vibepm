// Node 侧唯一配置源头：所有可配置默认值 / 路由 / 端点 / 枚举集中于此，禁止第二处重写字面量。

// ---- 可配置默认值（唯一源）----
// 阈值（active_* / stats_*）为「默认值」：三级取值 settings 运行时键（github.active_window_days 等，
// UI「分区设置」可改，立即生效）> vibepm.json 配置（ctx.mergedConfig("github")，重启生效）> 本常量兜底。
// 取数见 src/index.ts 的 thresholds()；活跃判据为 近 active_window_days 天提交 >= active_min_commits（注意 >=）。
export const API_BASE = "https://api.github.com";
export const CACHE_TTL_S = 60;           // 内存缓存 TTL（秒）
export const ACTIVE_WINDOW_DAYS = 30;    // 活跃判据窗口（天）——默认值；可被 settings / vibepm.json 配置覆盖
export const ACTIVE_MIN_COMMITS = 60;    // 活跃判据最少提交数：近 ACTIVE_WINDOW_DAYS 天内提交 ≥ 该值 为活跃（注意 ≥）——默认值；可被 settings / vibepm.json 配置覆盖
export const STATS_WINDOW_DAYS = 30;     // 展示提交数的窗口（天）——默认值；可被 settings / vibepm.json 配置覆盖
export const GH_TIMEOUT_MS = 8000;       // gh CLI 执行超时
export const REQUEST_TIMEOUT_MS = 20000; // GitHub API 请求超时
export const REPOS_PER_PAGE = 100;       // 分页大小
export const COMMITS_MAX_PAGES = 10;     // commits 翻页上限（防 GitHub 分页异常无限翻页；100×10=1000 commit 足够个人仓库）
export const REPO_PARALLEL = 5;          // /repos 逐仓并发上限
export const DEVICE_POLL_INTERVAL_S = 5; // Device Flow 轮询间隔兜底（秒）
export const DEVICE_EXPIRES_IN_S = 900;  // Device Flow 过期兜底（秒）
export const SHORT_SHA_LEN = 7;          // commit 短 sha 长度
export const DAY_MS = 86_400_000;        // 1 天毫秒数

// ---- 认证 / 端点 / headers ----
export const GH_DEVICE_CODE_URL = "https://github.com/login/device/code";
export const GH_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
export const GH_SCOPE = "repo read:user read:org"; // 唯一 scope 源（PAT 提示与 /device/start 同源引用）
export const GH_ACCEPT_MEDIA = "application/vnd.github+json";
export const GH_API_VERSION = "2022-11-28";
export const GH_USER_AGENT = "vibepm";
export const JSON_ACCEPT = "application/json";
export const JSON_CONTENT_TYPE = "application/json";

// ---- 路由（node/client 口径一致，client 侧同名副本见 client/constants.ts）----
export const API_PREFIX = "/api/github";
export const R_SUB_STATUS = "/status";
export const R_SUB_LOGIN = "/login";
export const R_SUB_LOGOUT = "/logout";
export const R_SUB_REPOS = "/repos";
export const R_SUB_DEVICE_START = "/device/start";
export const R_SUB_DEVICE_POLL = "/device/poll";

// ---- hash 路由 / 面板 kind / 槽位 id（node 注册；client 复用 hash 与 kind，见 client/constants.ts）----
export const HASH_AUTH = "auth";
export const HASH_REPOS = "repos";
export const HASH_REPO = "repo";
export const PANEL_KIND_AUTH = "github-auth-panel";
export const PANEL_KIND_REPOS = "github-repos-panel";
export const PANEL_KIND_DETAIL = "github-repo-detail-panel";
export const SLOT_AUTH = "github/auth";
export const SLOT_AUTH_NAV = "github/auth-nav";
export const SLOT_REPOS = "github/repos";
export const SLOT_REPOS_NAV = "github/repos-nav";
export const SLOT_DETAIL = "github/detail";

// ---- 面板 / 导航槽注册文案（node 侧；client 侧 TEXT 需口径一致，见 client/constants.ts）----
export const TEXT_AUTH_TITLE = "连接 GitHub";
export const TEXT_AUTH_DESC = "gh CLI 直连 / Device Flow / PAT 兜底；只读自己仓库动态，不做拉取推送。";
export const TEXT_AUTH_NAV_DESC = "连接 GitHub（gh / Device Flow / PAT）";
export const TEXT_REPOS_TITLE = "GitHub";       // 顶栏统一入口；页面内 h1 由 client 组件渲染「我的仓库」
export const TEXT_REPOS_DESC = "自有仓库，按近 N 天提交分区（活跃 / 尘封，N/M 可在面板「分区设置」调整）";
export const TEXT_REPOS_NAV_DESC = "自有仓库列表：活跃区 + 尘封区";
export const TEXT_DETAIL_TITLE = "仓库动态";
export const TEXT_DETAIL_DESC = "单仓动态 timeline（commits 为主）";

// ---- HTTP 状态码 ----
export const HTTP = { OK: 200, BAD_REQUEST: 400, NOT_FOUND: 404, BAD_GATEWAY: 502 } as const;

// ---- 错误码 / 错误信息（node 端；客户端文案见 client/constants.ts 的 TEXT）----
export const ERR_NO_TOKEN = "NO_TOKEN";
export const ERR_MSG_NO_TOKEN = "未连接 GitHub";
export const ERR_MSG_LOGIN_REQUIRED = "需要 username + token";
export const ERR_MSG_DEVICE_CLIENT_ID = "未配置 client_id：请在配置 github.client_id 填 GitHub OAuth App 的公开 client_id";
export const ERR_MSG_NOT_FOUND = "not found";
export const ERR_MSG_GITHUB = (status: number, message: string): string => `GitHub ${status}: ${message}`;

// ---- 事件类型（node commitFrequency 与 client classify/oneLine 共享语义；client 同名副本见 client/constants.ts）----
export const EVENT_TYPE_PUSH = "PushEvent";
export const EVENT_TYPE_PULL_REQUEST = "PullRequestEvent";
export const EVENT_TYPE_ISSUES = "IssuesEvent";
export const EVENT_TYPE_RELEASE = "ReleaseEvent";
export const EVENT_TYPE_WATCH = "WatchEvent";
export const EVENT_TYPE_FORK = "ForkEvent";
export const EVENT_TYPE_CREATE = "CreateEvent";
export const EVENT_TYPE_STAR = "StarEvent";
