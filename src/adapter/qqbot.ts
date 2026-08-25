import { QQApiClient, readResponseBody } from "./api.js";
import type { MessageSender } from "./types.js";
import type { FetchLike, OutboundMessage, SendOptions, SendResult } from "../types.js";

export class QQBotAdapter implements MessageSender {
  private readonly client: QQApiClient;

  constructor(appId: string, appSecret: string, fetchLike: FetchLike) {
    this.client = new QQApiClient(appId, appSecret, fetchLike);
  }

  sendToGroup(
    groupId: string,
    message: OutboundMessage,
    options?: SendOptions,
  ): Promise<SendResult> {
    return this.send(`/v2/groups/${encodeURIComponent(groupId)}/messages`, groupId, message, options);
  }

  sendToUser(
    userOpenid: string,
    message: OutboundMessage,
    options?: SendOptions,
  ): Promise<SendResult> {
    return this.send(`/v2/users/${encodeURIComponent(userOpenid)}/messages`, userOpenid, message, options);
  }

  private async send(
    path: string,
    target: string,
    message: OutboundMessage,
    options?: SendOptions,
  ): Promise<SendResult> {
    try {
      const response = await this.client.request(
        "POST",
        path,
        this.buildBody(message, options),
      );
      const body = await readResponseBody(response);
      if (response.ok) {
        return {
          ok: true,
          messageId: typeof body?.id === "string" ? body.id : undefined,
        };
      }
      return {
        ok: false,
        error: `发送失败 @ ${target}: HTTP ${response.status} ${formatBody(body)}`,
      };
    } catch (error) {
      return { ok: false, error: `发送失败 @ ${target}: ${String(error)}` };
    }
  }

  private buildBody(
    message: OutboundMessage,
    options?: SendOptions,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      msg_type: message.kind === "markdown" ? 2 : 0,
      content: message.kind === "text" ? message.text : "",
    };
    if (message.kind === "markdown") {
      body.markdown = { content: message.text };
    }
    if (options?.msgId) {
      body.msg_id = options.msgId;
      body.msg_seq = options.msgSeq ?? 1;
    }
    return body;
  }
}

function formatBody(body: Record<string, unknown> | null): string {
  if (!body) return "无响应正文";
  const code = body.err_code ?? body.code ?? body.errcode;
  const message = body.message ?? body.err_msg ?? body.errmsg;
  return [code === undefined ? "" : `code=${String(code)}`, typeof message === "string" ? message : ""]
    .filter(Boolean)
    .join(" ") || JSON.stringify(body);
}
