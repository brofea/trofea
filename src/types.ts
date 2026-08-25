/** 业务层与 QQ 适配层共享的平台无关类型。 */

export type ContentType = "puzzle" | "knowledge" | "story";

export const CONTENT_TYPES: readonly ContentType[] = [
  "puzzle",
  "knowledge",
  "story",
];

export const CONTENT_TITLE: Record<ContentType, string> = {
  puzzle: "【今日谜题】",
  knowledge: "【今日知识】",
  story: "【今日故事】",
};

export const PUZZLE_ENCOURAGEMENT = "欢迎各位尝试实现，有任何疑问欢迎提问！";

export interface ParsedContent {
  type: ContentType;
  source?: string;
  body: string;
  raw: string;
}

export interface FetchLike {
  fetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response>;
}

export interface OutboundMessage {
  kind: "markdown" | "text";
  text: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface SendOptions {
  /** 命令被动回复时携带的原始消息 ID；主动消息不设置。 */
  msgId?: string;
  msgSeq?: number;
}
