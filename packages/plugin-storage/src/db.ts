// storage 插件：本地 SQLite 存储，提供 db 服务（照 Python db.py + plugin.py；用 Node 内置 node:sqlite）
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface ProjectRow {
  repo_name: string;
  description: string | null;
  language: string | null;
  topics: string | null;
  stars: number;
  forks: number;
  commits_30d: number;
  open_issues: number;
  open_prs: number;
  releases: number;
  url: string | null;
  pushed_at: string | null;
  updated_at: string | null;
  goal: string | null;
  priority: string | null;
  status: string | null;
  tags: string | null;
  notes: string | null;
}

export interface TodoRow {
  id: number;
  project_id: string;
  title: string;
  priority: string;
  done: number;
}

export class Database {
  private conn: DatabaseSync;

  constructor(path: string) {
    const parent = dirname(path);
    if (parent) mkdirSync(parent, { recursive: true });
    this.conn = new DatabaseSync(path);
    this.initTables();
  }

  private initTables(): void {
    this.conn.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        repo_name TEXT PRIMARY KEY,
        description TEXT, language TEXT, topics TEXT,
        stars INTEGER DEFAULT 0, forks INTEGER DEFAULT 0,
        commits_30d INTEGER DEFAULT 0,
        open_issues INTEGER DEFAULT 0, open_prs INTEGER DEFAULT 0,
        releases INTEGER DEFAULT 0,
        url TEXT, pushed_at TEXT, updated_at TEXT,
        goal TEXT, priority TEXT, status TEXT, tags TEXT, notes TEXT
      );
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        priority TEXT DEFAULT '中',
        done INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sync_state (
        repo_name TEXT PRIMARY KEY,
        last_sync_at TEXT,
        last_activity_at TEXT
      );
    `);
  }

  listTables(): Set<string> {
    const rows = this.conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    return new Set(rows.map((r) => r.name));
  }

  upsertProject(row: Partial<ProjectRow> & { repo_name: string }): void {
    const stmt = this.conn.prepare(`
      INSERT INTO projects (repo_name, description, language, topics,
         stars, forks, commits_30d, open_issues, open_prs, releases,
         url, pushed_at, updated_at, goal, priority, status, tags, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(repo_name) DO UPDATE SET
           description=excluded.description, language=excluded.language,
           topics=excluded.topics, stars=excluded.stars,
           forks=excluded.forks, commits_30d=excluded.commits_30d,
           open_issues=excluded.open_issues, open_prs=excluded.open_prs,
           releases=excluded.releases, url=excluded.url,
           pushed_at=excluded.pushed_at, updated_at=excluded.updated_at,
           goal=excluded.goal, priority=excluded.priority,
           status=excluded.status, tags=excluded.tags, notes=excluded.notes`);
    stmt.run(
      row.repo_name, row.description ?? "", row.language ?? "", row.topics ?? "",
      row.stars ?? 0, row.forks ?? 0, row.commits_30d ?? 0,
      row.open_issues ?? 0, row.open_prs ?? 0, row.releases ?? 0,
      row.url ?? "", row.pushed_at ?? "", row.updated_at ?? "",
      row.goal ?? "", row.priority ?? "", row.status ?? "",
      row.tags ?? "", row.notes ?? "",
    );
  }

  getProject(repoName: string): ProjectRow | null {
    const row = this.conn.prepare("SELECT * FROM projects WHERE repo_name=?").get(repoName) as ProjectRow | undefined;
    return row ?? null;
  }

  listProjects(): ProjectRow[] {
    return this.conn.prepare("SELECT * FROM projects ORDER BY repo_name").all() as unknown as ProjectRow[];
  }

  addTodo(projectId: string, title: string, priority = "中"): number {
    const info = this.conn.prepare("INSERT INTO todos (project_id, title, priority) VALUES (?,?,?)").run(projectId, title, priority);
    return Number(info.lastInsertRowid);
  }

  setTodoDone(todoId: number, done: boolean): void {
    this.conn.prepare("UPDATE todos SET done=? WHERE id=?").run(done ? 1 : 0, todoId);
  }

  listTodos(projectId: string): TodoRow[] {
    return this.conn.prepare("SELECT * FROM todos WHERE project_id=? ORDER BY done, id").all(projectId) as unknown as TodoRow[];
  }

  recordSync(repoName: string, lastSyncAt: string, lastActivityAt = ""): void {
    this.conn.prepare(`
      INSERT INTO sync_state (repo_name, last_sync_at, last_activity_at)
      VALUES (?,?,?)
      ON CONFLICT(repo_name) DO UPDATE SET
        last_sync_at=excluded.last_sync_at,
        last_activity_at=excluded.last_activity_at`).run(repoName, lastSyncAt, lastActivityAt);
  }

  lastSync(repoName: string): string | null {
    const row = this.conn.prepare("SELECT last_sync_at FROM sync_state WHERE repo_name=?").get(repoName) as { last_sync_at: string } | undefined;
    return row?.last_sync_at ?? null;
  }

  close(): void {
    this.conn.close();
  }
}
