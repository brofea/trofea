/**
 * 诊断优先的错误类型。所有上游/解析/校验失败都带可读原因，
 * 调度层据此决定是跳过、记录还是回退。
 */

export class AppError extends Error {
  readonly code: string;
  constructor(code: string, message: string, readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** GitHub 请求失败（网络/5xx/超时）。 */
export class UpstreamError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("UPSTREAM_ERROR", message, cause);
  }
}

/** 当日内容文件不存在（HTTP 404）。 */
export class ContentNotFoundError extends AppError {
  readonly date: string;
  constructor(date: string) {
    super("CONTENT_NOT_FOUND", `当日内容不存在: ${date}`, undefined);
    this.date = date;
  }
}

/** Front Matter 缺失或字段非法。 */
export class FrontMatterError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("FRONTMATTER_ERROR", message, cause);
  }
}

/** 命令参数非法（如未来日期、格式错误）。 */
export class CommandError extends AppError {
  constructor(message: string) {
    super("COMMAND_ERROR", message);
  }
}

/** 适配层调用失败（鉴权/发送）。 */
export class AdapterError extends AppError {
  constructor(message: string, cause?: unknown) {
    super("ADAPTER_ERROR", message, cause);
  }
}
