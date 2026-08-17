// 字段插件基类（照 Python fields/base.py）
import type { Context } from "../../core/context.js";

export interface FieldDefinition {
  id: string;
  name: string;
  column: string;
  label: string;
  choices?: string[];
}

export class FieldService {
  constructor(readonly def: FieldDefinition) {}
  get column(): string { return this.def.column; }
  get label(): string { return this.def.label; }
  get choices(): string[] | undefined { return this.def.choices; }
  validate(value: unknown): unknown {
    if (this.def.choices && !this.def.choices.includes(String(value))) {
      throw new Error(`${this.label} 只能是 ${this.def.choices.join("/")}，得到 ${value}`);
    }
    return value;
  }
}

/** 把字段定义变成 dsh 形态插件对象（含 name/provide/apply），feature 雕service）。 */
export function fieldPlugin(def: FieldDefinition): { name: string; provide: string[]; inject: string[]; apply(ctx: Context): () => void } {
  const provides = [`field-${def.column}`];
  return {
    name: def.id,
    provide: provides,
    inject: [],
    apply(ctx: Context): () => void {
      ctx.provide(provides[0], new FieldService(def));
      return () => undefined;
    },
  };
}

/** todoService：本地 TODO 清单能力（照 Python fields/todo.py），依赖 db */
export class TodoService {
  name = "todoService";
  constructor(private db: any) {}
  add(projectId: string, title: string, priority = "中"): number {
    return this.db.addTodo(projectId, title, priority);
  }
  list(projectId: string): any[] { return this.db.listTodos(projectId); }
  done(todoId: number, done: boolean): void { return this.db.setTodoDone(todoId, done); }
}

/** 构造 todo 插件（todoService 提供者） */
export function todoPlugin(): { name: string; provide: string[]; inject: string[]; apply(ctx: Context): () => void } {
  return {
    name: "field-todo",
    provide: ["todoService"],
    inject: ["db"],
    apply(ctx: Context): () => void {
      ctx.provide("todoService", new TodoService(ctx.get("db")));
      return () => undefined;
    },
  };
}