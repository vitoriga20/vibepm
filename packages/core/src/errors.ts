// 内核错误类型（照 Python errors.py 语义）

export class PluginLoadError extends Error {}
export class ConfigError extends Error {}

/** 结构化 boot 错误：code 供运行时（CLI）结构化判 fatal，不按插件名/文案正则嗅探 */
export class BootError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "BootError";
  }
}
