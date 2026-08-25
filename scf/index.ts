import { handleWebhook } from "../src/adapter/webhook.js";
import { buildServices, handleVerifiedEvent, runDailyPush } from "../src/bootstrap.js";
import type { Env } from "../src/env.js";
import type { FetchLike } from "../src/types.js";

export interface ScfFunctionUrlEvent {
  body?: string;
  headers?: Record<string, string>;
  httpMethod?: string;
  path?: string;
  queryString?: Record<string, string>;
}

export interface ScfTimerEvent {
  Type: "Timer";
  TriggerName?: string;
  Time?: string;
  Message?: string;
}

export type ScfEvent = ScfFunctionUrlEvent & Partial<ScfTimerEvent>;

export interface ScfContext {
  request_id?: string;
  function_name?: string;
  function_version?: string;
  region?: string;
}

export interface ScfResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface ScfTimerResult {
  retcode: number;
}

function envFromProcess(): Env {
  return {
    CONTENT_BASE_URL: process.env.CONTENT_BASE_URL ?? "",
    GROUP_IDS: process.env.GROUP_IDS ?? "",
    QQ_BOT_APP_ID: process.env.QQ_BOT_APP_ID ?? "",
    QQ_BOT_APP_SECRET: process.env.QQ_BOT_APP_SECRET ?? "",
    ADMIN_OPENID: process.env.ADMIN_OPENID ?? "",
  };
}

function getHeader(headers: Record<string, string> | undefined, name: string): string {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === wanted) return value;
  }
  return "";
}

function jsonResponse(statusCode: number, value: unknown): ScfResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(value),
  };
}

export async function main_handler(
  event: ScfEvent,
  _context?: ScfContext,
): Promise<ScfResponse | ScfTimerResult> {
  const fetchLike: FetchLike = { fetch };
  const services = buildServices(envFromProcess(), fetchLike);

  if (event?.Type === "Timer") {
    const result = await runDailyPush(services, new Date(), (message, extra) => {
      console.log(`[daily] ${message}`, extra ?? "");
    });
    console.log("[scf:timer] result", result);
    return { retcode: 0 };
  }

  const rawBody = event.body ?? "";
  const webhook = handleWebhook({
    botSecret: services.config.appSecret,
    signatureHex: getHeader(event.headers, "X-Signature-Ed25519"),
    timestamp: getHeader(event.headers, "X-Signature-Timestamp"),
    rawBody,
  });

  if (webhook.kind === "rejected") {
    return { statusCode: 401, headers: { "content-type": "text/plain; charset=utf-8" }, body: "invalid signature" };
  }
  if (webhook.kind === "verification") {
    return jsonResponse(200, {
      plain_token: webhook.plainToken,
      signature: webhook.signature,
    });
  }

  try {
    await handleVerifiedEvent(services, webhook.event, new Date());
  } catch (error) {
    console.error("[webhook] event handling failed", error);
  }
  return jsonResponse(200, { op: 12, d: 0 });
}
