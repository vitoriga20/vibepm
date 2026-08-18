// settings 键名唯一源：全仓引用，禁止字符串散落。
// ---- 认证相关 5 键 ----
export const K_TOKEN = "github.token";
export const K_USERNAME = "github.username";
export const K_SOURCE = "github.source";
export const K_DEVICE_CODE = "github.device_code";
export const K_DEVICE_EXPIRES = "github.device_expires";
// ---- 阈值运行时键 3 键（UI「分区设置」修改 → POST /api/settings {batch} 写入，立即生效、持久化到 db；
//      优先级高于 vibepm.json 配置与常量默认；client 侧同名副本见 client/constants.ts）----
export const K_ACTIVE_WINDOW_DAYS = "github.active_window_days";
export const K_ACTIVE_MIN_COMMITS = "github.active_min_commits";
export const K_STATS_WINDOW_DAYS = "github.stats_window_days";
