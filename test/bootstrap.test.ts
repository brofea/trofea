import { describe, expect, it } from "vitest";
import type { WebhookEvent } from "../src/adapter/types.js";
import { handleVerifiedEvent } from "../src/bootstrap.js";
import type { Services } from "../src/bootstrap.js";
import { ContentService } from "../src/content/service.js";
import { mockFetch } from "./helpers.js";

const BASE = "https://raw.example.com/content";
const NOW = new Date("2026-08-23T00:00:00Z");

function makeServices() {
  const calls: { group: string[]; user: string[]; options: unknown[] } = { group: [], user: [], options: [] };
  const services: Services = {
    config: {
      contentBaseUrl: BASE,
      groupIds: ["g1"],
      appId: "app",
      appSecret: "secret",
      adminOpenid: "admin",
    },
    content: new ContentService(BASE, mockFetch({
      [`${BASE}/2026-08-23.md`]: { body: "---\ntype: puzzle\nsource: https://x\n---\n题" },
      [`${BASE}/2026-08-24.md`]: { body: "---\ntype: puzzle\nsource: https://x\n---\n未来题" },
    })),
    sender: {
      async sendToGroup(_id, message, options) {
        calls.group.push(message.text);
        calls.options.push(options);
        return { ok: true };
      },
      async sendToUser(_id, message, options) {
        calls.user.push(message.text);
        calls.options.push(options);
        return { ok: true };
      },
    },
  };
  return { services, calls };
}

describe("handleVerifiedEvent", () => {
  it("routes a group command and preserves msg_id for passive reply", async () => {
    const { services, calls } = makeServices();
    const event: WebhookEvent = {
      type: "GROUP_AT_MESSAGE_CREATE",
      data: {},
      groupOpenid: "g1",
      userOpenid: "u1",
      msgId: "incoming",
      content: "/今日谜题",
    };
    await handleVerifiedEvent(services, event, NOW);
    expect(calls.group[0]).toContain("【今日谜题】");
    expect(calls.options[0]).toEqual({ msgId: "incoming" });
  });

  it("routes a C2C command to the sender", async () => {
    const { services, calls } = makeServices();
    await handleVerifiedEvent(services, {
      type: "C2C_MESSAGE_CREATE",
      data: {},
      userOpenid: "u1",
      msgId: "incoming",
      content: "/历史谜题",
    }, NOW);
    expect(calls.user[0]).toContain("使用方法");
  });

  it("allows future history only for the administrator in C2C", async () => {
    const { services, calls } = makeServices();

    await handleVerifiedEvent(services, {
      type: "C2C_MESSAGE_CREATE",
      data: {},
      userOpenid: "not-admin",
      msgId: "non-admin-c2c-incoming",
      content: "/历史谜题 2026-08-24",
    }, NOW);
    expect(calls.user[0]).toContain("未来");

    await handleVerifiedEvent(services, {
      type: "C2C_MESSAGE_CREATE",
      data: {},
      userOpenid: "admin",
      msgId: "c2c-incoming",
      content: "/历史谜题 2026-08-24",
    }, NOW);
    expect(calls.user[1]).toContain("未来题");

    await handleVerifiedEvent(services, {
      type: "GROUP_AT_MESSAGE_CREATE",
      data: {},
      groupOpenid: "g1",
      userOpenid: "admin",
      msgId: "group-incoming",
      content: "/历史谜题 2026-08-24",
    }, NOW);
    expect(calls.group[0]).toContain("未来");
  });
});
