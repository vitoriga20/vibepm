// 认证三源 token 解析：gh CLI 实时读 → settings 里的 device/pat token
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { GH_TIMEOUT_MS } from "./constants.js";
import { K_TOKEN, K_SOURCE } from "./settings-keys.js";

export type TokenSource = "gh" | "device" | "pat";
export type AuthResult = { token: string | null; source: TokenSource };

/** 尝试 gh auth token；gh 不存在/未登录 → null */
export function ghToken(): string | null {
  try {
    const out = execFileSync("gh", ["auth", "token"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: GH_TIMEOUT_MS,
      windowsHide: true,
    });
    const t = String(out ?? "").trim();
    return t || null;
  } catch {
    return null;
  }
}

/** gh 不存在时回退解析 hosts.yml 的 github.com.oauth_token（行扫描，不引 YAML 库） */
export function ghHostsToken(): string | null {
  const candidates: string[] = process.platform === "win32"
    ? [join(process.env.APPDATA ?? "", "GitHub CLI", "hosts.yml")]
    : [join(homedir(), ".config", "gh", "hosts.yml")];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    let text = "";
    try { text = readFileSync(p, "utf-8"); } catch { continue; }
    // 定位 github.com: 段，取其下 oauth_token: <token>
    const lines = text.split(/\r?\n/);
    let inGithub = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("github.com:") || trimmed === "github.com") { inGithub = true; continue; }
      if (inGithub && /^[^:#][^:]*:/.test(trimmed) && !trimmed.startsWith("oauth_token")) { inGithub = false; }
      if (inGithub && /^oauth_token\s*:/.test(trimmed)) {
        const m = trimmed.match(/oauth_token\s*:\s*(?:"([^"]+)"|'([^']+)'|(\S+))/);
        const t = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
        if (t) return t;
      }
    }
  }
  return null;
}

/** 解析 token 来源：gh CLI（含 hosts 回退）→ settings 里的 device/pat；source 三源同步 */
export function resolveToken(getSetting: <T = unknown>(k: string) => T | null): AuthResult {
  const gh = ghToken() ?? ghHostsToken();
  if (gh) return { token: gh, source: "gh" };
  const stored = getSetting<string>(K_TOKEN);
  if (stored) return { token: stored, source: (getSetting<string>(K_SOURCE) as TokenSource) ?? "pat" };
  return { token: null, source: "pat" };
}
