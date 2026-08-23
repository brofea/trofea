/**
 * 领域类型：业务层与适配层共享的平台无关契约。
 *
 * 业务层只依赖这些类型，不直接依赖 QQ API 字段。
 */

/** 内容类型，对应 Front Matter 中的 `type` 字段。 */
export type ContentType = "puzzle" | "knowledge" | "story";

export const CONTENT_TYPES: readonly ContentType[] = ["puzzle", "knowledge", "story"];

/** 类型 → 标题前缀。集中定义，避免散落多处导致不一致（code-reuse 指南）。 */
export const CONTENT_TITLE: Record<ContentType, string> = {
  puzzle: "【今日谜题】",
  knowledge: "【今日知识】",
  story: "【今日故事】",
};

/** puzzle 结尾固定文案。 */
export const PUZZLE_ENCOURAGEMENT = "欢迎各位使用尝试实现，有任何疑问欢迎提问！";

/** 解析后的内容文件。`raw` 仅用于诊断。 */
export interface ParsedContent {
  type: ContentType;
  /** 仅当 type=puzzle 时必有；其它类型可能存在但不强制。 */
  source?: string;
  /** Markdown 正文（去掉 Front Matter 后）。 */
  body: string;
  /** 原始 Markdown 文本。 */
  raw: string;
}

/** 可注入的 fetch 抽象，便于单测替换与运行时复用 Worker fetch。 */
export interface FetchLike {
  fetch: typeof fetch;
}

/**
 * 适配层统一出站消息契约。
 * 业务层产出此结构，适配层负责翻译成具体平台请求。
 */
export interface OutboundMessage {
  /** 消息承载方式：尽量保留 Markdown。 */
  kind: "markdown" | "text";
  text: string;
}

/** 适配层发送结果。 */
export interface SendResult {
  ok: boolean;
  /** 平台返回的消息 id（如可用）。 */
  messageId?: string;
  /** 失败时的诊断信息。 */
  error?: string;
}

/** 发送选项，适配层据此决定被动回复还是主动消息。 */
export interface SendOptions {
  /** 被动回复时携带的上游消息 id（5 分钟有效）。 */
  msgId?: string;
  /** 回复序号，避免相同 msg_id 重复发送。 */
  msgSeq?: number;
}
