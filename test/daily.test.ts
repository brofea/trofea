import { describe, expect, it } from "vitest";
import { ContentService } from "../src/content/service.js";
import { DailyService } from "../src/daily/service.js";
import { addDays, formatDate } from "../src/utils/date.js";
import { mockFetch, mockSender } from "./helpers.js";

const BASE = "https://raw.example.com/content";
const TODAY = new Date("2026-08-23T00:00:00Z");

describe("DailyService", () => {
  it("pushes today's content and checks the next seven dates", async () => {
    const routes: Record<string, { body?: string; status?: number }> = {
      [`${BASE}/2026-08-23.md`]: { body: "---\ntype: story\n---\n今天" },
    };
    for (let i = 1; i <= 7; i += 1) {
      routes[`${BASE}/${formatDate(addDays(TODAY, i))}.md`] = { body: "---\ntype: story\n---\n未来" };
    }
    const { calls, sender } = mockSender();
    const result = await new DailyService({
      content: new ContentService(BASE, mockFetch(routes)),
      sender,
      groupIds: ["g1", "g2"],
      adminOpenid: "admin",
      log: () => {},
    }).run(TODAY);
    expect(result.date).toBe("2026-08-23");
    expect(calls.group).toHaveLength(2);
    expect(calls.user).toHaveLength(0);
  });

  it("sends an admin warning when future inventory is short", async () => {
    const { calls, sender } = mockSender();
    const result = await new DailyService({
      content: new ContentService(BASE, mockFetch({ [`${BASE}/2026-08-23.md`]: { status: 404 } })),
      sender,
      groupIds: ["g1"],
      adminOpenid: "admin",
      log: () => {},
    }).run(TODAY);
    expect(result.skipped).toBe(true);
    expect(calls.group).toHaveLength(0);
    expect(calls.user).toHaveLength(1);
    expect(calls.user[0].id).toBe("admin");
  });
});
