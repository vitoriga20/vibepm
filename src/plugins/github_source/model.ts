// 数据映射（照 Python model.py）
export interface RawRepo {
  name: string;
  description?: string | null;
  language?: string | null;
  topics?: string[];
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  html_url?: string;
  pushed_at?: string | null;
  updated_at?: string | null;
}

export function mapRepo(raw: RawRepo, commits30d = 0): Record<string, any> {
  return {
    repo_name: raw.name,
    description: raw.description ?? "",
    language: raw.language ?? "",
    topics: (raw.topics ?? []).join(","),
    stars: raw.stargazers_count ?? 0,
    forks: raw.forks_count ?? 0,
    commits_30d: commits30d,
    open_issues: raw.open_issues_count ?? 0,
    open_prs: 0,
    releases: 0,
    url: raw.html_url ?? "",
    pushed_at: raw.pushed_at ?? "",
    updated_at: raw.updated_at ?? "",
  };
}

export function mapIssues(owner: string, repo: string, items: any[]): Array<Record<string, any>> {
  return items.map((i) => ({
    source: "github",
    ref: `#${i.number}`,
    title: i.title,
    state: i.state,
    url: i.html_url,
  }));
}