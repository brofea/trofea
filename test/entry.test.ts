import { describe, expect, it, vi } from "vitest";
import nacl from "tweetnacl";
import worker from "../src/index.js";
import type { Env } from "../src/env.js";

const SECRET = "naOC0ocQE3shWLAfffVLB1rhYPG7";

function env(): Env {
  return {
    CONTENT_BASE_URL: "https://raw.example.com/content/",
    GROUP_IDS: '["g1"]',
    TIMEZONE: "Asia/Shanghai",
    QQ_APP_ID: "APP",
    QQ_CLIENT_SECRET: "SECRET",
    QQ_BOT_SECRET: SECRET,
  };
}

function seedFromSecret(s: string): Uint8Array {
  const enc = new TextEncoder();
  let acc = s;
  while (enc.encode(acc).length < nacl.sign.seedLength) acc = acc + acc;
  return enc.encode(acc).subarray(0, nacl.sign.seedLength);
}

function sign(timestamp: string, rawBody: string): string {
  const msg = new TextEncoder().encode(timestamp + rawBody);
  const sig = nacl.sign.detached(msg, nacl.sign.keyPair.fromSeed(seedFromSecret(SECRET)).secretKey);
  return Buffer.from(sig).toString("hex");
}

async function call(req: Request) {
  const res = await worker.fetch(req, env(), { waitUntil: vi.fn() } as never);
  return { status: res.status, body: await res.text() };
}

describe("Worker fetch handler (safe paths)", () => {
  it("rejects requests missing signature headers with 401", async () => {
    const req = new Request("https://bot/", {
      method: "POST",
      body: '{"op":0,"d":{}}',
    });
    const r = await call(req);
    expect(r.status).toBe(401);
  });

  it("handles op=13 callback verification (no signature headers)", async () => {
    // 官方回调地址校验请求：{"op":13,"d":{"plain_token","event_ts"}}，无 X-Signature 头。
    const plainToken = "Arq0D5A61EgUu4OxUvOp";
    const eventTs = "1725442341";
    const rawBody = JSON.stringify({ op: 13, d: { plain_token: plainToken, event_ts: eventTs } });
    const req = new Request("https://bot/", {
      method: "POST",
      body: rawBody,
    });
    const r = await call(req);
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.plain_token).toBe(plainToken);
    // signature = Ed25519.Sign(privateKey, event_ts + plain_token) hex，可独立复算。
    const expected = Buffer.from(
      nacl.sign.detached(
        new TextEncoder().encode(eventTs + plainToken),
        nacl.sign.keyPair.fromSeed(seedFromSecret(SECRET)).secretKey,
      ),
    ).toString("hex");
    expect(body.signature).toBe(expected);
  });

  it("accepts unknown event without crashing", async () => {
    const rawBody = JSON.stringify({ op: 0, t: "UNKNOWN_EVENT", d: {} });
    const ts = "1701";
    const req = new Request("https://bot/", {
      method: "POST",
      body: rawBody,
      headers: {
        "X-Signature-Ed25519": sign(ts, rawBody),
        "X-Signature-Timestamp": ts,
      },
    });
    const r = await call(req);
    expect(r.status).toBe(200);
  });
});
