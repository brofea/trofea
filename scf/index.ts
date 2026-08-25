import { handleWebhook } from "../src/adapter/webhook.js";
import {
  buildServices,
  handleVerifiedEvent,
  runDailyPush,
} from "../src/bootstrap.js";
import type { Env } from "../src/env.js";
import type { FetchLike } from "../src/types.js";
import { formatDate } from "../src/utils/date.js";

/**
 * 腾讯云 SCF 入口（事件函数，`index.main_handler`）。
 *
 * 两路触发分流：
 *   - 定时触发器：event.Type === "Timer" → 每日推送。
 *   - 函数 URL（HTTP webhook）：从 event 取 headers/body/httpMethod → handleWebhook。
 *
 * 函数 URL 事件要点（研究结论）：
 *   - event.body 是原始字符串，不要 base64 解码（无 isBase64Encoded 字段）。
 *   - event.headers 是扁平对象，key 可能全小写，签名头需大小写不敏感查找。
 *   - 响应返回集成响应格式 { statusCode, headers, body }。
 */

/** 函数 URL 事件（事件函数）。字段为研究结论中的关键子集。 */
export interface ScfFunctionUrlEvent {
  /** 请求体原始字符串（非 base64）。 */
  body?: string;
  /** 扁平请求头对象，key 可能全小写。 */
  headers?: Record<string, string>;
  httpMethod?: string;
  path?: string;
  queryString?: Record<string, string>;
}

/** 定时触发器事件。 */
export interface ScfTimerEvent {
  Type: "Timer";
  TriggerName?: string;
  /** 触发创建时间，UTC+0。 */
  Time?: string;
  Message?: string;
}

export type ScfEvent = ScfFunctionUrlEvent & Partial<ScfTimerEvent>;

/** SCF 运行时上下文（仅保留使用到的字段，避免依赖平台类型）。 */
export interface ScfContext {
  request_id?: string;
  function_name?: string;
  function_version?: string;
  memory_limit_in_mb?: number;
  time_limit_in_ms?: number;
  region?: string;
}

/** 集成响应：返回 { statusCode, headers, body }（兼容 APIGW 4 字段形式）。 */
export interface ScfResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/** Timer 触发成功后返回的普通值。 */
export interface ScfTimerResult {
  retcode: number;
}

function envFromProcess(): Env {
  return {
    CONTENT_BASE_URL: process.env.CONTENT_BASE_URL ?? "",
    GROUP_IDS: process.env.GROUP_IDS ?? "",
    TIMEZONE: process.env.TIMEZONE ?? "Asia/Shanghai",
    QQ_BOT_ID: process.env.QQ_BOT_ID ?? "",
    QQ_BOT_SECRET: process.env.QQ_BOT_SECRET ?? "",
    DEBUG_LOG_IDS: process.env.DEBUG_LOG_IDS,
  };
}

/** 大小写不敏感地查找请求头。 */
function header(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return "";
}

/**
 * SCF 入口。esbuild 以 CJS 打包后导出 `exports.main_handler`。
 */
export async function main_handler(
  event: ScfEvent,
  _context?: ScfContext,
): Promise<ScfResponse | ScfTimerResult> {
  // 定时触发器：执行每日推送。
  if (event && event.Type === "Timer") {
    const services = buildServices(envFromProcess(), { fetch });
    const res = await runDailyPush(
      services,
      new Date(),
      (m, extra) =>
        console.log(`[daily ${formatDate(new Date())}] ${m}`, extra ?? ""),
    );
    console.log("[scf:timer] result", res);
    return { retcode: 0 };
  }

  // 函数 URL：HTTP webhook。
  const services = buildServices(envFromProcess(), { fetch });
  const rawBody = event.body ?? "";
  const result = handleWebhook({
    botSecret: services.config.botSecret,
    signatureHex: header(event.headers, "X-Signature-Ed25519"),
    timestamp: header(event.headers, "X-Signature-Timestamp"),
    rawBody,
  });

  if (result.kind === "rejected") {
    return {
      statusCode: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: "invalid signature",
    };
  }
  if (result.kind === "verification") {
    // 回调地址校验：回填 plain_token + 用 Bot Secret 派生私钥签名的 signature。
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        plain_token: result.plainToken,
        signature: result.signature,
      }),
    };
  }

  await handleVerifiedEvent(services, result.event, new Date());
  return { statusCode: 200, headers: {}, body: "ok" };
}
