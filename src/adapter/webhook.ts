import nacl from "tweetnacl";
import type { WebhookEvent } from "./types.js";

/**
 * QQ Bot Webhook 签名（Ed25519）。
 *
 * 官方算法：
 *   - 回调地址校验（配置回调时） https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/webhook.html
 *       请求 body: {"op":13,"d":{"plain_token","event_ts"}}（无 X-Signature 头）
 *       响应 body: {"plain_token","signature"}
 *       signature = Ed25519.Sign(privateKey, event_ts + plain_token) 的 hex
 *   - 事件签名校验（每次回调） https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/sign.html
 *       msg = X-Signature-Timestamp + 原始 body
 *       Ed25519.Verify(publicKey, msg, hexDecode(X-Signature-Ed25519))
 *
 * 两者共用同一密钥派生：seed = 重复 botSecret 直到 >= 32 字节，取前 32 字节；
 * keyPair = Ed25519.fromSeed(seed)。tweetnacl 的 `sign.keyPair.fromSeed` 与
 * Go ed25519.GenerateKey(seed) 使用相同的 RFC 8032 seed→key 派生，结果一致。
 */

const SEED_SIZE = nacl.sign.seedLength;

// 等价 Go: seed=botSecret; while len<32 { seed=strings.Repeat(seed,2) }; seed=seed[:32]
function deriveSeed(botSecret: string): Uint8Array {
  const enc = new TextEncoder();
  let acc = botSecret;
  while (enc.encode(acc).length < SEED_SIZE) {
    acc = acc + acc;
  }
  return enc.encode(acc).subarray(0, SEED_SIZE);
}
/** 从 Bot Secret 派生 Ed25519 密钥对（公钥用于验签，私钥用于回调签名）。 */
export function deriveKeyPair(botSecret: string): nacl.SignKeyPair {
  return nacl.sign.keyPair.fromSeed(deriveSeed(botSecret));
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const n = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(n)) return null;
    out[i] = n;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function verifyWebhookSignature(opts: {
  botSecret: string;
  signatureHex: string;
  timestamp: string;
  rawBody: string;
}): boolean {
  if (!opts.signatureHex || !opts.timestamp) return false;
  const sig = hexToBytes(opts.signatureHex);
  if (!sig || sig.length !== nacl.sign.signatureLength) return false;
  const publicKey = deriveKeyPair(opts.botSecret).publicKey;
  const msg = new TextEncoder().encode(opts.timestamp + opts.rawBody);
  return nacl.sign.detached.verify(msg, sig, publicKey);
}

/**
 * 回调地址校验签名：用 Bot Secret 派生的私钥对 event_ts + plain_token 签名，
 * 返回 hex 字符串。可独立单测（不依赖 HTTP）。
 */
export function signCallbackVerification(opts: {
  botSecret: string;
  eventTs: string;
  plainToken: string;
}): string {
  const { secretKey } = deriveKeyPair(opts.botSecret);
  const msg = new TextEncoder().encode(opts.eventTs + opts.plainToken);
  return bytesToHex(nacl.sign.detached(msg, secretKey));
}

/**
 * 解析 Webhook 事件。对未知事件不抛错（PRD：不支持的事件不会导致 SCF 崩溃）。
 * 签名校验在外部完成；此函数只做结构解析与最小路由信息提取。
 */
export function parseWebhookEvent(rawBody: string): WebhookEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (payload == null || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const op = typeof obj.op === "number" ? obj.op : undefined;
  const type =
    typeof obj.t === "string"
      ? obj.t
      : typeof obj.event_type === "string"
        ? (obj.event_type as string)
        : "";
  const data = obj.d ?? obj;

  const event: WebhookEvent = { type, op, data };
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    event.groupOpenid =
      typeof d.group_openid === "string" ? d.group_openid : undefined;
    event.msgId =
      typeof d.id === "string"
        ? d.id
        : typeof d.msg_id === "string"
          ? (d.msg_id as string)
          : undefined;
    const content = typeof d.content === "string" ? d.content : undefined;
    event.content = content?.replace(/<@!\d+>/g, "").trim() || undefined;
    if (typeof d.author === "object" && d.author !== null) {
      const author = d.author as Record<string, unknown>;
      event.userOpenid =
        typeof author.user_openid === "string" ? author.user_openid : undefined;
      event.memberOpenid =
        typeof author.member_openid === "string" ? author.member_openid : undefined;
    }
  }
  return event;
}

function isVerificationData(
  data: unknown,
): data is { plain_token: string; event_ts: string } {
  if (data == null || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d.plain_token === "string" && typeof d.event_ts === "string";
}

/** handleWebhook 的判别式结果。 */
export type WebhookOutcome =
  | { kind: "verification"; plainToken: string; signature: string }
  | { kind: "event"; event: WebhookEvent | null }
  | { kind: "rejected" };

/**
 * 完整处理一次 webhook 请求。
 *
 * 顺序遵循官方协议：
 *   1. 回调地址校验（op=13 + plain_token + event_ts）在事件签名校验之前处理，
 *      该请求不带 X-Signature 头；用 Bot Secret 派生私钥签名回填。
 *   2. 普通事件严格校验 X-Signature-Ed25519 + X-Signature-Timestamp（覆盖
 *      timestamp + 原始 body）；缺失/非法一律返回 rejected，由入口回 401。
 */
export function handleWebhook(opts: {
  botSecret: string;
  signatureHex: string;
  timestamp: string;
  rawBody: string;
}): WebhookOutcome {
  const event = parseWebhookEvent(opts.rawBody);

  if (event?.op === 13 && isVerificationData(event.data)) {
    return {
      kind: "verification",
      plainToken: event.data.plain_token,
      signature: signCallbackVerification({
        botSecret: opts.botSecret,
        eventTs: event.data.event_ts,
        plainToken: event.data.plain_token,
      }),
    };
  }

  if (!verifyWebhookSignature(opts)) {
    return { kind: "rejected" };
  }
  return { kind: "event", event };
}
