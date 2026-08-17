import { fieldPlugin } from "../base.js";

// priority 字段
export const PLUGIN = fieldPlugin({ id: "field-priority", name: "field-priority", column: "priority", label: "优先级", choices: ["高", "中", "低"] });