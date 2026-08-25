import { describe, expect, it } from "vitest";
import { buildCommandMessage, buildInventoryWarning, buildMessage } from "../src/message/builder.js";

const puzzle = { type: "puzzle" as const, source: "https://example.com/p", body: "题目", raw: "" };

describe("message builders", () => {
  it("uses the PRD puzzle template", () => {
    expect(buildMessage(puzzle).text).toBe(
      "【今日谜题】\n\n题目\n\n欢迎各位尝试实现，有任何疑问欢迎提问！\n原题链接：https://example.com/p",
    );
  });

  it("adds the no-puzzle note only for command knowledge/story", () => {
    expect(buildCommandMessage({ ...puzzle, type: "knowledge", source: undefined }).text)
      .toContain("今天没有谜题，休息一下吧");
    expect(buildMessage({ ...puzzle, type: "story", source: undefined }).text)
      .toBe("【今日故事】\n\n题目");
  });

  it("builds the inventory warning", () => {
    expect(buildInventoryWarning(5, ["2026-08-29", "2026-08-31"]).text)
      .toContain("未来 7 天仅准备了 5/7 份内容");
  });
});
