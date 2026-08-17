import { fieldPlugin } from "../base.js";

// status 字段
export const PLUGIN = fieldPlugin({ id: "field-status", name: "field-status", column: "status", label: "状态", choices: ["进行中", "暂停", "完成", "搁置"] });