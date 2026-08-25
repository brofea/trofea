import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import { QQBotAdapter } from "../src/adapter/qqbot.js";
import {
  handleWebhook,
  parseWebhookEvent,
  signCallbackVerification,
  verifyWebhookSignature,
} from "../src/adapter/webhook.js";
import type { FetchLike } from "../src/types.js";

const SECRET = "naOC0ocQE3shWLAfffVLB1rhYPG7";

function recordingFetch(handler: (url: string, init: RequestInit) => Response): FetchLike {
  return {
    fetch: async (input, init) => handler(typeof input === "string" ? input : input.toString(), init ?? {}),
  };
}

describe("QQBotAdapter", () => {
  it("uses separate token and OpenAPI endpoints", async () => {
    const urls: string[] = [];
    const fetchLike = recordingFetch((url) => {
      urls.push(url);
      if (url === "https://bots.qq.com/app/getAppAccessToken") {
        return Response.json({ access_token: "token", expires_in: 7200 });
      }
      return Response.json({ id: "message-1" });
    });
    const adapter = new QQBotAdapter("app", SECRET, fetchLike);
    const result = await adapter.sendToGroup("group-1", { kind: "markdown", text: "正文" });
    expect(result.ok).toBe(true);
    expect(urls).toEqual([
      "https://bots.qq.com/app/getAppAccessToken",
      "https://api.sgroup.qq.com/v2/groups/group-1/messages",
    ]);
  });

  it("uses msg_id only for a passive reply", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchLike = recordingFetch((url, init) => {
      if (url === "https://bots.qq.com/app/getAppAccessToken") {
        return Response.json({ access_token: "token", expires_in: 7200 });
      }
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Response.json({ id: "m" });
    });
    const adapter = new QQBotAdapter("app", SECRET, fetchLike);
    await adapter.sendToGroup("g", { kind: "text", text: "主动" });
    await adapter.sendToUser("u", { kind: "text", text: "被动" }, { msgId: "incoming" });
    expect(bodies[0]).not.toHaveProperty("msg_id");
    expect(bodies[1]).toMatchObject({ msg_id: "incoming", msg_seq: 1 });
  });

  it("returns a failed result when token acquisition fails", async () => {
    const adapter = new QQBotAdapter("app", SECRET, recordingFetch(() => new Response("bad", { status: 401 })));
    const result = await adapter.sendToGroup("g", { kind: "text", text: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("access_token");
  });
});

describe("QQ WebHook", () => {
  it("handles op=13 before signature headers", () => {
    const body = JSON.stringify({ op: 13, d: { plain_token: "plain", event_ts: "123" } });
    expect(handleWebhook({ botSecret: SECRET, signatureHex: "", timestamp: "", rawBody: body })).toEqual({
      kind: "verification",
      plainToken: "plain",
      signature: signCallbackVerification({ botSecret: SECRET, eventTs: "123", plainToken: "plain" }),
    });
  });

  it("verifies normal event signatures", () => {
    const rawBody = JSON.stringify({ op: 0, t: "GROUP_AT_MESSAGE_CREATE", d: {} });
    const timestamp = "1700";
    const signatureHex = sign(timestamp, rawBody);
    expect(verifyWebhookSignature({ botSecret: SECRET, signatureHex, timestamp, rawBody })).toBe(true);
    expect(handleWebhook({ botSecret: SECRET, signatureHex, timestamp, rawBody }).kind).toBe("event");
  });

  it("extracts command and identifiers", () => {
    const event = parseWebhookEvent(JSON.stringify({
      op: 0,
      t: "GROUP_AT_MESSAGE_CREATE",
      d: { id: "m1", group_openid: "g1", content: "<@!123> /今日谜题", author: { user_openid: "u1" } },
    }));
    expect(event).toMatchObject({ type: "GROUP_AT_MESSAGE_CREATE", groupOpenid: "g1", msgId: "m1", userOpenid: "u1", content: "/今日谜题" });
  });
});

function sign(timestamp: string, body: string): string {
  const signature = nacl.sign.detached(
    new TextEncoder().encode(timestamp + body),
    nacl.sign.keyPair.fromSeed(seedFromSecret(SECRET)).secretKey,
  );
  return Buffer.from(signature).toString("hex");
}

function seedFromSecret(secret: string): Uint8Array {
  const encoder = new TextEncoder();
  let value = secret;
  while (encoder.encode(value).length < nacl.sign.seedLength) value += value;
  return encoder.encode(value).subarray(0, nacl.sign.seedLength);
}
