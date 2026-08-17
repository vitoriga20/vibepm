// GitHub REST 直连 + 设备码 OAuth（照 Python gh.py；用原生 fetch）

export const API_BASE = "https://api.github.com";
export const CLIENT_ID = "178c6fc778ccc68e1d6a"; // GitHub CLI 公开 client id

export class GithubApiError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`GitHub API ${status}: ${body}`);
    this.name = "GithubApiError";
  }
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export async function ghRequest(method: string, path: string, token?: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "vibepm",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method, headers, signal: AbortSignal.timeout(30000) });
  if (res.status >= 400) {
    throw new GithubApiError(res.status, (await res.text()).slice(0, 200));
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function ghRepos(owner: string, token?: string): Promise<any[]> {
  const data = await ghRequest("GET", `/users/${owner}/repos?type=owner&sort=pushed&per_page=100`, token);
  return Array.isArray(data) ? data : [];
}

export async function ghCommits30d(owner: string, repo: string, token?: string): Promise<number> {
  const data = await ghRequest("GET", `/repos/${owner}/${repo}/commits?since=${daysAgoIso(30)}&per_page=100`, token);
  return Array.isArray(data) ? data.length : 0;
}

export async function ghMe(token: string): Promise<any> {
  return ghRequest("GET", "/user", token);
}

// ---- 设备码 OAuth ----
export class DeviceFlowError extends Error {}

export async function startDeviceFlow(): Promise<{ device_code: string; user_code: string; verification_uri: string; interval: number; expires_in: number }> {
  const res = await fetch(`${API_BASE}/login/device/code`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: "repo" }),
  });
  const data = (await res.json()) as Record<string, any>;
  if (res.status >= 400) throw new DeviceFlowError(JSON.stringify(data));
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    interval: data.interval ?? 5,
    expires_in: data.expires_in ?? 900,
  };
}

export async function pollToken(deviceCode: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, device_code: deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
  });
  const data = (await res.json()) as Record<string, any>;
  if (data.access_token) return data.access_token;
  if (data.error === "authorization_pending") return null;
  throw new DeviceFlowError(JSON.stringify(data));
}