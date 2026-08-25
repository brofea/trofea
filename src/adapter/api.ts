import { AdapterError } from "../errors.js";
import type { FetchLike } from "../types.js";

export const QQ_API_BASE = "https://api.sgroup.qq.com";
export const QQ_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

export class QQApiClient {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly fetchLike: FetchLike,
  ) {}

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.expiresAt - 60_000) {
      return this.accessToken;
    }

    let response: Response;
    try {
      response = await this.fetchLike.fetch(QQ_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ appId: this.appId, clientSecret: this.appSecret }),
      });
    } catch (error) {
      throw new AdapterError("获取 QQ access_token 网络失败", error);
    }

    const body = await this.readJson(response);
    if (!response.ok || typeof body?.access_token !== "string") {
      throw new AdapterError(
        `获取 QQ access_token 失败: HTTP ${response.status} ${response.statusText}`,
      );
    }

    this.accessToken = body.access_token;
    this.expiresAt = now + (body.expires_in ?? 7200) * 1000;
    return this.accessToken;
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const token = await this.getAccessToken();
    return this.fetchLike.fetch(`${QQ_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `QQBot ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  private async readJson(response: Response): Promise<TokenResponse | null> {
    try {
      const value: unknown = await response.json();
      return value !== null && typeof value === "object"
        ? (value as TokenResponse)
        : null;
    } catch {
      return null;
    }
  }
}

export async function readResponseBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
