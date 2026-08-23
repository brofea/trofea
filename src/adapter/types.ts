import type { OutboundMessage, SendOptions, SendResult } from "../types.js";

/**
 * 平台无关发送接口。业务层（DailyService、CommandRouter）只依赖此接口，
 * 不耦合 QQ API 字段或 endpoint。未来增加 Telegram/Discord 只需新实现。
 */
export interface MessageSender {
  /** 发送到群（按 PRD：仅向环境变量配置的群发送）。 */
  sendToGroup(
    groupId: string,
    message: OutboundMessage,
    opts?: SendOptions,
  ): Promise<SendResult>;
}

/** 解析后的 Webhook 事件。 */
export interface WebhookEvent {
  /** QQ 事件类型，如 GROUP_AT_MESSAGE_CREATE / INTERACTION_CREATE。 */
  type: string;
  /** 事件 op。0=dispatch, 11=heartbeat/ack, 13=http 回调地址校验。 */
  op?: number;
  /** 数据载荷（已 JSON 解析）。 */
  data: unknown;
  /** 若是群 @ 消息，解析出回复所需的 msg_id 与群 openid。 */
  groupOpenid?: string;
  msgId?: string;
  /** 命令文本（已去除 @ 机器人前缀，按需）。 */
  content?: string;
}

export type { OutboundMessage, SendOptions, SendResult };
