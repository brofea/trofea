import { afterEach, describe, expect, it, vi } from "vitest";
import nacl from "tweetnacl";
import { main_handler } from "../scf/index.js";

const SECRET = "naOC0ocQE3shWLAfffVLB1rhYPG7";

afterEach(() => vi.unstubAllGlobals());

function setEnv(): void {
  process.env.CONTENT_BASE_URL = "https://raw.example.com/content";
  process.env.GROUP_IDS = "g1";
  process.env.QQ_BOT_APP_ID = "app";
  process.env.QQ_BOT_APP_SECRET = SECRET;
  process.env.ADMIN_OPENID = "admin";
}

describe("SCF main_handler", () => {
  it("returns op=13 verification response without signature headers", async () => {
    setEnv();
    const result = await main_handler({
      body: JSON.stringify({ op: 13, d: { plain_token: "plain", event_ts: "123" } }),
      headers: {},
    });
    expect(result).toMatchObject({ statusCode: 200 });
    expect(JSON.parse((result as { body: string }).body)).toMatchObject({ plain_token: "plain" });
  });

  it("returns QQ success ACK for an unknown signed event", async () => {
    setEnv();
    const body = JSON.stringify({ op: 0, t: "UNKNOWN_EVENT", d: {} });
    const timestamp = "1700";
    const signature = nacl.sign.detached(
      new TextEncoder().encode(timestamp + body),
      nacl.sign.keyPair.fromSeed(seedFromSecret(SECRET)).secretKey,
    );
    const result = await main_handler({
      body,
      headers: {
        "X-Signature-Timestamp": timestamp,
        "X-Signature-Ed25519": Buffer.from(signature).toString("hex"),
      },
    });
    expect(result).toMatchObject({ statusCode: 200 });
    expect(JSON.parse((result as { body: string }).body)).toEqual({ op: 12, d: 0 });
  });

  it("rejects an invalid signature", async () => {
    setEnv();
    const result = await main_handler({ body: "{}", headers: {} });
    expect(result).toMatchObject({ statusCode: 401 });
  });

  it("routes Timer events to the daily service", async () => {
    setEnv();
    vi.stubGlobal("fetch", async () => new Response("missing", { status: 404 }));
    await expect(main_handler({ Type: "Timer" })).resolves.toEqual({ retcode: 0 });
  });
});

function seedFromSecret(secret: string): Uint8Array {
  const encoder = new TextEncoder();
  let value = secret;
  while (encoder.encode(value).length < nacl.sign.seedLength) value += value;
  return encoder.encode(value).subarray(0, nacl.sign.seedLength);
}
