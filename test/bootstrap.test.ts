import { describe, expect, it } from "vitest";
import type { WebhookEvent } from "../src/adapter/types.js";
import { handleVerifiedEvent } from "../src/bootstrap.js";
import type { Services } from "../src/bootstrap.js";
import { ContentService } from "../src/content/service.js";
import { mockFetch } from "./helpers.js";

const BASE = "https://raw.example.com/content/";
const NOW = new Date("2026-08-23T00:00:00Z");

function makeServices() {
  const calls: { group: string[]; user: string[] } = { group: [], user: [] };
  const services: Services = {
    config: {
      contentBaseUrl: BASE,
      groupIds: ["g1"],
      botId: "APP",
      botSecret: "SECRET",
      timezone: "Asia/Shanghai",
      debugLogIds: false,
    },
    content: new ContentService(BASE, mockFetch({})),
    sender: {
      async sendToGroup(_gid: string, message: { text: string }) {
        calls.group.push(message.text);
        return { ok: true, messageId: "mg" };
      },
      async sendToUser(_uid: string, message: { text: string }) {
        calls.user.push(message.text);
        return { ok: true, messageId: "mu" };
      },
    },
  };
  return { services, calls };
}

describe("handleVerifiedEvent command routing", () => {
  it("group /聊天ID replies via sendToGroup with both ids", async () => {
    const { services, calls } = makeServices();
    const event: WebhookEvent = {
      type: "GROUP_AT_MESSAGE_CREATE",
      data: {},
      groupOpenid: "g1",
      msgId: "MSG1",
      content: "/聊天ID",
      userOpenid: "u1",
      memberOpenid: "m1",
    };
    await handleVerifiedEvent(services, event, NOW);
    expect(calls.group).toEqual(["群 openid: g1\n发送者 openid: u1"]);
    expect(calls.user).toHaveLength(0);
  });

  it("C2C /聊天ID replies via sendToUser with sender id", async () => {
    const { services, calls } = makeServices();
    const event: WebhookEvent = {
      type: "C2C_MESSAGE_CREATE",
      data: {},
      msgId: "MSG2",
      content: "/聊天ID",
      userOpenid: "u2",
    };
    await handleVerifiedEvent(services, event, NOW);
    expect(calls.user).toEqual(["发送者 openid: u2"]);
    expect(calls.group).toHaveLength(0);
  });

  it("C2C without userOpenid is skipped", async () => {
    const { services, calls } = makeServices();
    const event: WebhookEvent = {
      type: "C2C_MESSAGE_CREATE",
      data: {},
      content: "/聊天ID",
    };
    await handleVerifiedEvent(services, event, NOW);
    expect(calls.user).toHaveLength(0);
    expect(calls.group).toHaveLength(0);
  });

  it("unknown command replies to neither target", async () => {
    const { services, calls } = makeServices();
    const event: WebhookEvent = {
      type: "GROUP_AT_MESSAGE_CREATE",
      data: {},
      groupOpenid: "g1",
      msgId: "MSG3",
      content: "/未知",
      userOpenid: "u1",
    };
    await handleVerifiedEvent(services, event, NOW);
    expect(calls.group).toHaveLength(0);
    expect(calls.user).toHaveLength(0);
  });
});
