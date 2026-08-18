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

  // ---- 提交统计：commits API 按窗口计数 + 最近提交时间 + 最近提交列表 ----
  // 说明：events API 的 PushEvent payload 已不含 commits 详情（仅 ref/head/before），
  //       提交数改用 commits 接口（?since= 窗口起点）统计，顺带返回最近提交时间与最近 commit 列表。
  //       空仓库（409 "Git Repository is empty"）降级返回 empty:true，不抛错。
  async commitStats(
    owner: string,
    repo: string,
    daysArr: number[],
  ): Promise<{ counts: Record<number, number>; lastCommitAt: string | null; recent: Array<{ sha: string; message: string; date: string }>; empty: boolean }> {
    const maxDays = Math.max(...daysArr);
    const since = new Date(Date.now() - maxDays * DAY_MS).toISOString();
    const key = `cc:${owner}/${repo}:${maxDays}:${this.tokenFingerprint()}`;
    const cached = this.cacheGet<{ counts: Record<number, number>; lastCommitAt: string | null; recent: Array<{ sha: string; message: string; date: string }>; empty: boolean }>(key);
    if (cached) return cached;
    const commits: Array<{ at: number; sha: string; message: string; date: string }> = [];
    let empty = false;
    try {
      let page = 1;
      for (;;) {
        const data = await this.fetchJson(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${REPOS_PER_PAGE}&since=${encodeURIComponent(since)}&page=${page}`,
        );
        if (!Array.isArray(data) || data.length === 0) break;
        for (const c of data) {
          const d = c?.commit?.committer?.date ?? c?.commit?.author?.date;
          if (!d) continue;
          commits.push({ at: Date.parse(d), sha: String(c?.sha ?? ""), message: String(c?.commit?.message ?? ""), date: String(d) });
        }
        if (data.length < REPOS_PER_PAGE) break;
        page += 1;
      }
    } catch (e) {
      if ((e as any)?.code === "GH_409") { empty = true; } else { throw e; }
    }
    // 窗口去重：daysArr 可能含重复天数（activeWindowDays === statsWindowDays），重复会双重计数
    const uniqueDays = [...new Set(daysArr)];
    const now = Date.now();
    const counts: Record<number, number> = {};
    for (const d of uniqueDays) counts[d] = 0;
    for (const c of commits) {
      if (!Number.isFinite(c.at)) continue;
      for (const d of uniqueDays) if (c.at >= now - d * DAY_MS) counts[d] += 1;
    }
    commits.sort((a, b) => b.at - a.at);
    const lastCommitAt = commits.length > 0 ? commits[0].date : null;
    const recent = commits.slice(0, 5).map((c) => ({ sha: c.sha, message: c.message.split("\n")[0] || "", date: c.date }));
    const out = { counts, lastCommitAt, recent, empty };
    this.cacheSet(key, out);
    return out;
  }
}
