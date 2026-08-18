// GitHub REST 封装：fetchJson 通用 + 三源认证 + 仓库/事件聚合 + TTL 缓存
import { resolveToken, type AuthResult } from "./auth.js";
import {
  API_BASE, CACHE_TTL_S, DAY_MS, GH_ACCEPT_MEDIA, GH_API_VERSION, GH_USER_AGENT, JSON_CONTENT_TYPE,
  ERR_NO_TOKEN, ERR_MSG_NO_TOKEN, ERR_MSG_GITHUB, REPOS_PER_PAGE, REQUEST_TIMEOUT_MS,
} from "./constants.js";

export type DbLike = {
  getSetting<T = unknown>(k: string): T | null;
  setSetting<T = unknown>(k: string, v: T): void;
  deleteSetting(k: string): void;
};

export type GhUser = { login: string; name?: string; avatar_url?: string };
export type RepoMeta = {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  private: boolean;
  archived: boolean;
  fork: boolean;
  updated_at: string;
};

export class GitHubService {
  name = "github";
  constructor(
    private readonly db: DbLike,
    private readonly apiBase = API_BASE,
    private readonly cacheTtlMs = CACHE_TTL_S * 1000,
  ) {}

  // ---- 三源认证（gh 实时读 → settings device/pat；/status 也用此判断 source）----
  auth(): AuthResult { return resolveToken((k) => this.db.getSetting(k)); }
  /** token 尾 8 位指纹：缓存 key 归属（logout / 换 token 后自然失效） */
  tokenFingerprint(): string {
    const t = this.auth().token ?? "";
    return t.length > 8 ? t.slice(-8) : t;
  }

  // ---- 内存 TTL 缓存 ----
  private cache = new Map<string, { at: number; val: unknown }>();
  cacheGet<T>(key: string): T | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.cacheTtlMs) { this.cache.delete(key); return undefined; }
    return hit.val as T;
  }
  cacheSet(key: string, val: unknown): void { this.cache.set(key, { at: Date.now(), val }); }
  clearCache(): void { this.cache.clear(); }

  // ---- 通用请求（token 走三源解析）----
  async fetchJson(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<any> {
    const { token } = this.auth();
    if (!token) throw Object.assign(new Error(ERR_MSG_NO_TOKEN), { code: ERR_NO_TOKEN });
    const base = this.apiBase;
    const url = /^https?:/.test(path) ? path : base + (path.startsWith("/") ? "" : "/") + path;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": GH_ACCEPT_MEDIA,
          "X-GitHub-Api-Version": GH_API_VERSION,
          "User-Agent": GH_USER_AGENT,
          ...(opts.body ? { "Content-Type": JSON_CONTENT_TYPE } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      const text = await r.text();
      let json: any; try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
      if (!r.ok) throw Object.assign(new Error(ERR_MSG_GITHUB(r.status, json?.message ?? r.statusText)), { code: "GH_" + r.status, json });
      return json;
    } finally { clearTimeout(timer); }
  }

  async me(): Promise<GhUser | null> {
    try { return (await this.fetchJson("/user")) as GhUser; }
    catch (e) { if ((e as any).code === ERR_NO_TOKEN) return null; throw e; }
  }

  // ---- 仓库列表（分页合并全量）----
  async listRepos(): Promise<RepoMeta[]> {
    const out: any[] = [];
    let page = 1;
    for (;;) {
      const batch = await this.fetchJson(`/user/repos?per_page=${REPOS_PER_PAGE}&sort=updated&page=${page}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      out.push(...batch);
      if (batch.length < REPOS_PER_PAGE) break;
      page += 1;
    }
    return out as RepoMeta[];
  }

  // ---- 单仓 events（TTL 缓存，key 含 token 尾 8 位指纹；/repos 聚合与单仓详情共用）----
  async repoEvents(owner: string, repo: string): Promise<any[]> {
    const key = `ev:${owner}/${repo}:${this.tokenFingerprint()}`;
    const cached = this.cacheGet<any[]>(key);
    if (cached) return cached;
    const data = await this.fetchJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/events?per_page=${REPOS_PER_PAGE}`);
    const arr = Array.isArray(data) ? data : [];
    this.cacheSet(key, arr);
    return arr;
  }

  // ---- 提交统计：commits API 按窗口计数 + 最近提交时间 ----
  // 说明：events API 的 PushEvent payload 已不含 commits 详情（仅 ref/head/before，无 distinct_size/commits 数组），
  //       提交数改用 commits 接口（?since= 窗口起点）统计，顺带返回最近提交时间供列表「最近提交」列。
  async commitStats(
    owner: string,
    repo: string,
    daysArr: number[],
  ): Promise<{ counts: Record<number, number>; lastCommitAt: string | null }> {
    const maxDays = Math.max(...daysArr);
    const since = new Date(Date.now() - maxDays * DAY_MS).toISOString();
    const key = `cc:${owner}/${repo}:${maxDays}:${this.tokenFingerprint()}`;
    const cached = this.cacheGet<{ counts: Record<number, number>; lastCommitAt: string | null }>(key);
    if (cached) return cached;
    const dates: number[] = [];
    let page = 1;
    for (;;) {
      const data = await this.fetchJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${REPOS_PER_PAGE}&since=${encodeURIComponent(since)}&page=${page}`,
      );
      if (!Array.isArray(data) || data.length === 0) break;
      for (const c of data) {
        const d = c?.commit?.committer?.date ?? c?.commit?.author?.date;
        if (d) dates.push(Date.parse(d));
      }
      if (data.length < REPOS_PER_PAGE) break;
      page += 1;
    }
    const now = Date.now();
    const counts: Record<number, number> = {};
    for (const d of daysArr) counts[d] = 0;
    for (const at of dates) {
      if (!Number.isFinite(at)) continue;
      for (const d of daysArr) if (at >= now - d * DAY_MS) counts[d] += 1;
    }
    dates.sort((a, b) => b - a);
    const lastCommitAt = dates.length > 0 ? new Date(dates[0]).toISOString() : null;
    const out = { counts, lastCommitAt };
    this.cacheSet(key, out);
    return out;
  }
}
