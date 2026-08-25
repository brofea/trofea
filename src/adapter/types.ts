import type { OutboundMessage, SendOptions, SendResult } from "../types.js";

export interface MessageSender {
  sendToGroup(
    groupId: string,
    message: OutboundMessage,
    options?: SendOptions,
  ): Promise<SendResult>;
  sendToUser(
    userOpenid: string,
    message: OutboundMessage,
    options?: SendOptions,
  ): Promise<SendResult>;
}

export interface WebhookEvent {
  type: string;
  op?: number;
  data: unknown;
  groupOpenid?: string;
  userOpenid?: string;
  memberOpenid?: string;
  msgId?: string;
  content?: string;
}

export type { OutboundMessage, SendOptions, SendResult };
