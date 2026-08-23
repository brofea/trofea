import { describe, expect, it } from "vitest";
import { DailyService } from "../src/daily/service.js";
import { ContentService } from "../src/content/service.js";
import { mockFetch, mockSender } from "./helpers.js";

const BASE = "https://raw.example.com/content/";
const today = new Date("2026-08-23T00:00:00Z"); // 北京 08:00

function makeContent(routes: Record<string, { status?: number; body?: string }>) {
  return new ContentService(BASE, mockFetch(routes));
}

describe("DailyService.run", () => {
  it("pushes today's content to all configured groups", async () => {
    const content = makeContent({
      [`${BASE}2026-08-23.md`]: { body: "---\ntype: puzzle\nsource: https://x/p\n---\n题" },
    });
    const { calls, sender } = mockSender();
    const daily = new DailyService({
      content,
      sender,
      groupIds: ["g1", "g2"],
      log: () => {},
    });
    const r = await daily.run(today);
    expect(r.skipped).toBe(false);
    expect(r.pushed).toEqual(["g1", "g2"]);
    expect(calls.group).toHaveLength(2);
    expect(calls.group[0].text).toContain("【今日谜题】");
  });

  it("skips sending when today content missing (no fallback)", async () => {
    const content = makeContent({ [`${BASE}2026-08-23.md`]: { status: 404 } });
    const { calls, sender } = mockSender();
    const daily = new DailyService({
      content,
      sender,
      groupIds: ["g1"],
      log: () => {},
    });
    const r = await daily.run(today);
    expect(r.skipped).toBe(true);
    expect(calls.group).toHaveLength(0);
    expect(r.reason).toContain("当日内容不存在");
  });

  it("skips on upstream error", async () => {
    const content = makeContent({ [`${BASE}2026-08-23.md`]: { status: 503 } });
    const { calls, sender } = mockSender();
    const daily = new DailyService({
      content,
      sender,
      groupIds: ["g1"],
      log: () => {},
    });
    const r = await daily.run(today);
    expect(r.skipped).toBe(true);
    expect(calls.group).toHaveLength(0);
    expect(r.reason).toContain("上游不可用");
  });

  it("does not lock to platform fields: sender receives OutboundMessage only", async () => {
    const content = makeContent({
      [`${BASE}2026-08-23.md`]: { body: "---\ntype: story\n---\ns" },
    });
    const { calls, sender } = mockSender();
    const daily = new DailyService({
      content,
      sender,
      groupIds: ["g1"],
      log: () => {},
    });
    await daily.run(today);
    // 仅 text/kind 字段，无 msg_type/group_openid 等平台字段泄漏
    expect(calls.group[0]).toHaveProperty("text");
    expect(calls.group[0]).not.toHaveProperty("msg_type");
  });
});
