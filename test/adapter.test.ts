import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import { QQBotAdapter } from "../src/adapter/qqbot.js";
import {
  deriveKeyPair,
  handleWebhook,
  parseWebhookEvent,
  signCallbackVerification,
  verifyWebhookSignature,
} from "../src/adapter/webhook.js";
import { AdapterError } from "../src/errors.js";
import type { FetchLike } from "../src/types.js";

const SECRET = "naOC0ocQE3shWLAfffVLB1rhYPG7";
const TOKEN = "tok_123";
const GROUP_ID = "grp_openid_A";

/** 拦截并断言请求的 fetch 桩。 */
function recordingFetch(handler: (url: string, init: RequestInit) => Response): FetchLike {
  return {
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.toString();
      return handler(u, init ?? {});
    },
  };
}

describe("QQBotAdapter token + send", () => {
  it("fetches token then sends group markdown message", async () => {
    let tokenCalls = 0;
    let sendBody: Record<string, unknown> | null = null;
    const fetchLike = recordingFetch((url, init) => {
      if (url.endsWith("/app/getAppAccessToken")) {
        tokenCalls++;
        return Response.json({ access_token: TOKEN, expires_in: 7200 });
      }
      if (url.includes(`/v2/groups/${GROUP_ID}/messages`)) {
        sendBody = JSON.parse(init.body as string);
        return Response.json({ id: "ROBOT1.0_xyz", timestamp: "x" });
      }
      return new Response("no", { status: 404 });
    });
    const a = new QQBotAdapter("APP", "SECRET", fetchLike);
    const r = await a.sendToGroup(GROUP_ID, { kind: "markdown", text: "## t" });
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe("ROBOT1.0_xyz");
    expect(tokenCalls).toBe(1);
    expect(sendBody).toMatchObject({
      msg_type: 2,
      markdown: { content: "## t" },
      content: "",
    });
  });

  it("caches token across sends", async () => {
    let tokenCalls = 0;
    const fetchLike = recordingFetch((url) => {
      if (url.endsWith("/app/getAppAccessToken")) {
        tokenCalls++;
        return Response.json({ access_token: TOKEN, expires_in: 7200 });
      }
      return Response.json({ id: "m1" });
    });
    const a = new QQBotAdapter("APP", "S", fetchLike);
    await a.sendToGroup(GROUP_ID, { kind: "text", text: "hi" });
    await a.sendToGroup("g2", { kind: "text", text: "p" });
    expect(tokenCalls).toBe(1);
  });

  it("text message uses msg_type 0", async () => {
    let body: Record<string, unknown> | null = null;
    const fetchLike = recordingFetch((url, init) => {
      if (url.endsWith("/app/getAppAccessToken"))
        return Response.json({ access_token: TOKEN, expires_in: 7200 });
      body = JSON.parse(init.body as string);
      return Response.json({ id: "m" });
    });
    const a = new QQBotAdapter("APP", "S", fetchLike);
    await a.sendToGroup(GROUP_ID, { kind: "text", text: "纯文本" }, { msgId: "pm" });
    expect(body).toMatchObject({
      msg_type: 0,
      content: "纯文本",
      msg_id: "pm",
      msg_seq: 1,
    });
  });

  it("token fetch failure → AdapterError", async () => {
    const fetchLike = recordingFetch((url) => {
      if (url.endsWith("/app/getAppAccessToken"))
        return new Response("bad", { status: 401 });
      return new Response("", { status: 404 });
    });
    const a = new QQBotAdapter("APP", "S", fetchLike);
    await expect(
      a.sendToGroup(GROUP_ID, { kind: "text", text: "x" }),
    ).rejects.toBeInstanceOf(AdapterError);
  });

  it("non-ok send returns ok:false with diagnostics", async () => {
    const fetchLike = recordingFetch((url) => {
      if (url.endsWith("/app/getAppAccessToken"))
        return Response.json({ access_token: TOKEN, expires_in: 7200 });
      return Response.json({ err_code: 50006, message: "空消息", trace_id: "t1" }, {
        status: 400,
      });
    });
    const a = new QQBotAdapter("APP", "S", fetchLike);
    const r = await a.sendToGroup(GROUP_ID, { kind: "text", text: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("err_code=50006");
  });
});

describe("QQBotAdapter sendToUser (C2C)", () => {
  it("POSTs to /v2/users/<openid>/messages with Authorization header", async () => {
    let tokenCalls = 0;
    let sendMethod = "";
    let sendUrl = "";
    let authHeader = "";
    let sendBody: Record<string, unknown> | null = null;
    const fetchLike = recordingFetch((url, init) => {
      if (url.endsWith("/app/getAppAccessToken")) {
        tokenCalls++;
        return Response.json({ access_token: TOKEN, expires_in: 7200 });
      }
      if (url.includes("/v2/users/u1/messages")) {
        sendMethod = init.method ?? "";
        sendUrl = url;
        authHeader = (init.headers as Record<string, string>).Authorization ?? "";
        sendBody = JSON.parse(init.body as string);
        return Response.json({ id: "ROBOT1.0_c2c" });
      }
      return new Response("no", { status: 404 });
    });
    const a = new QQBotAdapter("APP", "SECRET", fetchLike);
    const r = await a.sendToUser("u1", { kind: "text", text: "发送者 openid: u1" });
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe("ROBOT1.0_c2c");
    expect(tokenCalls).toBe(1);
    expect(sendMethod).toBe("POST");
    expect(sendUrl).toBe("https://api.bot.qq.com/v2/users/u1/messages");
    expect(authHeader).toBe(`QQBot ${TOKEN}`);
    expect(sendBody).toMatchObject({ msg_type: 0, content: "发送者 openid: u1" });
  });

  it("URL-encodes the user openid", async () => {
    let sendUrl = "";
    const fetchLike = recordingFetch((url) => {
      if (url.endsWith("/app/getAppAccessToken"))
        return Response.json({ access_token: TOKEN, expires_in: 7200 });
      if (url.includes("/v2/users/")) {
        sendUrl = url;
        return Response.json({ id: "m" });
      }
      return new Response("no", { status: 404 });
    });
    const a = new QQBotAdapter("APP", "S", fetchLike);
    await a.sendToUser("u/1 x", { kind: "text", text: "hi" });
    expect(sendUrl).toBe("https://api.bot.qq.com/v2/users/u%2F1%20x/messages");
  });
});

describe("webhook signature verification", () => {
  it("verifies a real Ed25519 signature round-trip", () => {
    const timestamp = "1725442341";
    const rawBody = '{"op":0,"d":{},"t":"GROUP_AT_MESSAGE_CREATE"}';
    const msg = new TextEncoder().encode(timestamp + rawBody);
    const sig = nacl.sign.detached(msg, nacl.sign.keyPair.fromSeed(
      // 重建与 deriveSeed 相同的 seed 以签名
      seedFromSecret(SECRET),
    ).secretKey);
    const sigHex = Buffer.from(sig).toString("hex");
    expect(verifyWebhookSignature({ botSecret: SECRET, signatureHex: sigHex, timestamp, rawBody })).toBe(true);
  });

  it("rejects tampered body", () => {
    const timestamp = "1";
    const rawBody = '{"ok":true}';
    const msg = new TextEncoder().encode(timestamp + rawBody);
    const sig = nacl.sign.detached(msg, nacl.sign.keyPair.fromSeed(seedFromSecret(SECRET)).secretKey);
    const sigHex = Buffer.from(sig).toString("hex");
    expect(
      verifyWebhookSignature({
        botSecret: SECRET,
        signatureHex: sigHex,
        timestamp,
        rawBody: '{"ok":false}',
      }),
    ).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(
      verifyWebhookSignature({ botSecret: SECRET, signatureHex: "", timestamp: "", rawBody: "x" }),
    ).toBe(false);
  });
});
describe("signCallbackVerification", () => {
  it("matches an independently computed Ed25519 signature", () => {
    const eventTs = "1725442341";
    const plainToken = "Arq0D5A61EgUu4OxUvOp";
    const sig = signCallbackVerification({
      botSecret: SECRET,
      eventTs,
      plainToken,
    });
    // 与官方算法一致：Ed25519.Sign(privateKey, event_ts + plain_token) 的 hex。
    const expected = Buffer.from(
      nacl.sign.detached(
        new TextEncoder().encode(eventTs + plainToken),
        deriveKeyPair(SECRET).secretKey,
      ),
    ).toString("hex");
    expect(sig).toBe(expected);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe("handleWebhook", () => {
  // 回调地址校验：op=13 + plain_token + event_ts，不带事件签名头。
  it("op=13 callback verification returns plain_token + signature (no signature headers)", () => {
    const rawBody = JSON.stringify({
      op: 13,
      d: { plain_token: "Arq0D5A61EgUu4OxUvOp", event_ts: "1725442341" },
    });
    const r = handleWebhook({
      botSecret: SECRET,
      signatureHex: "",
      timestamp: "",
      rawBody,
    });
    expect(r).toEqual({
      kind: "verification",
      plainToken: "Arq0D5A61EgUu4OxUvOp",
      signature: signCallbackVerification({
        botSecret: SECRET,
        eventTs: "1725442341",
        plainToken: "Arq0D5A61EgUu4OxUvOp",
      }),
    });
  });

  it("normal event with valid signature returns parsed event", () => {
    const rawBody = JSON.stringify({ op: 0, t: "GROUP_AT_MESSAGE_CREATE", d: {} });
    const timestamp = "1700";
    const sigHex = Buffer.from(
      nacl.sign.detached(
        new TextEncoder().encode(timestamp + rawBody),
        nacl.sign.keyPair.fromSeed(seedFromSecret(SECRET)).secretKey,
      ),
    ).toString("hex");
    const r = handleWebhook({
      botSecret: SECRET,
      signatureHex: sigHex,
      timestamp,
      rawBody,
    });
    expect(r.kind).toBe("event");
    if (r.kind === "event") expect(r.event?.type).toBe("GROUP_AT_MESSAGE_CREATE");
  });

  it("normal event missing signature headers is rejected", () => {
    const r = handleWebhook({
      botSecret: SECRET,
      signatureHex: "",
      timestamp: "",
      rawBody: JSON.stringify({ op: 0, d: {} }),
    });
    expect(r.kind).toBe("rejected");
  });

  it("normal event with tampered body is rejected", () => {
    const rawBody = '{"ok":true}';
    const timestamp = "1";
    const sigHex = Buffer.from(
      nacl.sign.detached(
        new TextEncoder().encode(timestamp + rawBody),
        nacl.sign.keyPair.fromSeed(seedFromSecret(SECRET)).secretKey,
      ),
    ).toString("hex");
    const r = handleWebhook({
      botSecret: SECRET,
      signatureHex: sigHex,
      timestamp,
      rawBody: '{"ok":false}',
    });
    expect(r.kind).toBe("rejected");
  });
});

describe("parseWebhookEvent", () => {
  it("extracts group @ message fields", () => {
    const e = parseWebhookEvent(
      JSON.stringify({
        op: 0,
        t: "GROUP_AT_MESSAGE_CREATE",
        d: { id: "MSG1", group_openid: "g1", content: "<@!42> /今日谜题" },
      }),
    );
    expect(e?.type).toBe("GROUP_AT_MESSAGE_CREATE");
    expect(e?.groupOpenid).toBe("g1");
    expect(e?.msgId).toBe("MSG1");
    expect(e?.content).toBe("/今日谜题");
  });

  it("extracts author openids from group @ message", () => {
    const e = parseWebhookEvent(
      JSON.stringify({
        op: 0,
        t: "GROUP_AT_MESSAGE_CREATE",
        d: {
          id: "MSG1",
          group_openid: "g1",
          content: "<@!42> /今日谜题",
          author: { user_openid: "u1", member_openid: "m1" },
        },
      }),
    );
    expect(e?.userOpenid).toBe("u1");
    expect(e?.memberOpenid).toBe("m1");
  });

  it("extracts author user_openid from C2C message", () => {
    const e = parseWebhookEvent(
      JSON.stringify({
        op: 0,
        t: "C2C_MESSAGE_CREATE",
        d: { author: { user_openid: "u2" } },
      }),
    );
    expect(e?.userOpenid).toBe("u2");
    expect(e?.memberOpenid).toBeUndefined();
  });

  it("returns null for invalid json", () => {
    expect(parseWebhookEvent("{bad")).toBeNull();
  });

  it("handles unknown event without crashing", () => {
    const e = parseWebhookEvent(JSON.stringify({ op: 0, t: "UNKNOWN_EVENT" }));
    expect(e?.type).toBe("UNKNOWN_EVENT");
  });
});

// 与 adapter/webhook.ts deriveSeed 一致的 seed 重建（仅测试用）。
function seedFromSecret(botSecret: string): Uint8Array {
  const enc = new TextEncoder();
  let acc = botSecret;
  while (enc.encode(acc).length < nacl.sign.seedLength) acc = acc + acc;
  return enc.encode(acc).subarray(0, nacl.sign.seedLength);
}
