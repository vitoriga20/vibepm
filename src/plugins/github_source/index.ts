// github-source 插件：拉 GitHub 仓库数据 → 写 db，提供 repoStore 服务（照 Python plugin.py）
import type { Context } from "../../core/context.js";
import { ghRepos, ghCommits30d, ghMe, GithubApiError } from "./gh.js";
import { mapRepo } from "./model.js";

export class RepoStore {
  name = "repoStore";
  constructor(
    private syncFn: () => Promise<void>,
    private ownerFn: () => string,
    private tokenFn: () => string,
  ) {}
  sync(): Promise<void> { return this.syncFn(); }
  get owner(): string { return this.ownerFn(); }
  get token(): string { return this.tokenFn(); }
}

class GithubSourcePlugin {
  name = "github-source";
  provide = ["repoStore"];
  inject = ["db"];

  apply(ctx: Context): () => void {
    const ghConfig = () => ctx.mergedConfig("github");
    const token = () => ghConfig().token ?? "";
    const owner = () => ghConfig().owner ?? "";

    const sync = async (): Promise<void> => {
      const tk = token();
      const db: any = ctx.get("db");
      if (!tk) return;
      let ow = owner();
      if (!ow) {
        try {
          ow = (await ghMe(tk)).login;
          const d = { ...ghConfig() };
          d.owner = ow;
          const loader = ctx.loader as any;
          if (loader?.save_runtime) loader.save_runtime(ctx, "github", d);
        } catch (e) {
          if (e instanceof GithubApiError) return;
          throw e;
        }
      }
      const repos = await ghRepos(ow, tk);
      for (const raw of repos) {
        let commits = 0;
        try {
          commits = await ghCommits30d(ow, raw.name, tk);
        } catch { commits = 0; }
        const p = mapRepo(raw, commits);
        db.upsertProject(p);
        db.recordSync(p.repo_name, new Date().toISOString());
      }
      ctx.emit("repoStore.updated", { owner: ow });
    };

    const store = new RepoStore(sync, owner, token);
    ctx.provide("repoStore", store);

    const disposers: Array<() => void> = [];
    disposers.push(ctx.on("sync.run", () => void sync()));

    return () => {
      for (const off of disposers) { try { off(); } catch { /* noop */ } }
      if (ctx.has("repoStore")) ctx.unprovide("repoStore");
    };
  }
}

export const PLUGIN = new GithubSourcePlugin();