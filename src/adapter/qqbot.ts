import { AdapterError } from "../errors.js";
import type {
  OutboundMessage,
  SendOptions,
  SendResult,
} from "../types.js";
import type { FetchLike } from "../types.js";
import type { MessageSender } from "./types.js";

const API_BASE = "https://api.bot.qq.com";
const TOKEN_PATH = "/app/getAppAccessToken";

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface ApiResponseBody {
  id?: string;
  err_code?: number;
  message?: string;
  trace_id?: string;
}

/**
 * QQ Bot 适配器：实现 MessageSender，封装鉴权与 v2 群消息发送。
 *
 * 业务层只看到 MessageSender 接口；平台字段（msg_type、group_openid、
 * Authorization 头）仅存在于本文件，满足“发送接口不把业务层锁死在平台字段名”。
 *
 * Token 缓存：access_token 默认 7200s，缓存到过期前 60s 刷新。
 */
export class QQBotAdapter implements MessageSender {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly botId: string,
    private readonly botSecret: string,
    private readonly fetchLike: FetchLike,
  ) {}

  async sendToGroup(
    groupId: string,
    message: OutboundMessage,
    opts?: SendOptions,
  ): Promise<SendResult> {
    const url = `${API_BASE}/v2/groups/${encodeURIComponent(groupId)}/messages`;
    return this.send(url, groupId, message, opts);
  }


  private async send(
    url: string,
    target: string,
    message: OutboundMessage,
    opts?: SendOptions,
  ): Promise<SendResult> {
    const token = await this.ensureToken();
    const body = this.buildBody(message, opts);
    let res: Response;
    try {
      res = await this.fetchLike.fetch(url, {
        method: "POST",
        headers: {
          Authorization: `QQBot ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return { ok: false, error: `发送请求失败 @ ${target}: ${String(e)}` };
    }
    const json = (await this.safeJson(res)) as ApiResponseBody | null;
    if (res.ok && json && json.id) {
      return { ok: true, messageId: json.id };
    }
    return {
      ok: false,
      error: `发送失败 @ ${target}: HTTP ${res.status} ${json ? `err_code=${json.err_code} ${json.message ?? ""} trace=${json.trace_id ?? ""}` : res.statusText}`,
    };
  }

  private buildBody(
    message: OutboundMessage,
    opts?: SendOptions,
  ): Record<string, unknown> {
    const msgType = message.kind === "markdown" ? 2 : 0;
    const body: Record<string, unknown> = { msg_type: msgType };
    if (message.kind === "markdown") {
      // msg_type=2 时 content 必须为空。
      body.markdown = { content: message.text };
      body.content = "";
    } else {
      body.content = message.text;
    }
    if (opts?.msgId) {
      body.msg_id = opts.msgId;
      body.msg_seq = opts.msgSeq ?? 1;
    }
    return body;
  }

  private async ensureToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.expiresAt - 60_000) {
      return this.accessToken;
    }
    let res: Response;
    try {
      res = await this.fetchLike.fetch(`${API_BASE}${TOKEN_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          appId: this.botId,
          clientSecret: this.botSecret,
        }),
      });
    } catch (e) {
      throw new AdapterError("获取 access_token 网络失败", e);
    }
    const json = (await this.safeJson(res)) as TokenResponse | null;
    if (!res.ok || !json?.access_token) {
      throw new AdapterError(
        `获取 access_token 失败: HTTP ${res.status} ${res.statusText}`,
      );
    }
    this.accessToken = json.access_token;
    this.expiresAt = now + (json.expires_in ?? 7200) * 1000;
    return this.accessToken;
  }

  private async safeJson(res: Response): Promise<unknown | null> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
}
