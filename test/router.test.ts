import { describe, expect, it } from "vitest";
import { CommandRouter } from "../src/commands/router.js";
import { ContentService } from "../src/content/service.js";
import { mockFetch } from "./helpers.js";

const BASE = "https://raw.example.com/content";
const TODAY = new Date("2026-08-23T00:00:00Z");

function router(routes: Record<string, { status?: number; body?: string }>): CommandRouter {
  return new CommandRouter({ content: new ContentService(BASE, mockFetch(routes)), today: TODAY });
}

describe("CommandRouter", () => {
  it("returns today's content", async () => {
    const result = await router({
      [`${BASE}/2026-08-23.md`]: { body: "---\ntype: knowledge\n---\n知识" },
    }).handle("/今日谜题");
    expect(result?.message.text).toContain("【今日知识】");
    expect(result?.message.text).toContain("今天没有谜题");
  });

  it("reads a historical puzzle and rejects future dates", async () => {
    const result = await router({
      [`${BASE}/2026-08-20.md`]: { body: "---\ntype: puzzle\nsource: https://x\n---\n历史" },
    }).handle("/历史谜题 2026-08-20");
    expect(result?.message).toEqual({
      kind: "markdown",
      text: "【今日谜题】\n\n历史\n\n欢迎各位尝试实现，有任何疑问欢迎提问！\n原题链接：https://x",
    });
    expect((await router({}).handle("/历史谜题 2026-08-24"))?.message.text)
      .toContain("未来");
  });

  it.each([
    ["knowledge", "【今日知识】"],
    ["story", "【今日故事】"],
  ] as const)("returns historical %s content with a no-puzzle notice", async (type, title) => {
    const result = await router({
      [`${BASE}/2026-08-20.md`]: { body: `---\ntype: ${type}\n---\n历史内容` },
    }).handle("/历史谜题 2026-08-20");

    expect(result?.message).toMatchObject({ kind: "markdown" });
    expect(result?.message.text).toContain("这一天没有谜题");
    expect(result?.message.text).toContain(title);
    expect(result?.message.text).toContain("历史内容");
    expect(result?.message.text.indexOf("这一天没有谜题")).toBeLessThan(
      result?.message.text.indexOf(title) ?? -1,
    );
  });

  it("returns usage without a history date", async () => {
    expect((await router({}).handle("/历史谜题"))?.message.text).toContain("YYYY-MM-DD");
    expect(await router({}).handle("hello")).toBeNull();
  });
});
