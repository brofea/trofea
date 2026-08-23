import { describe, expect, it } from "vitest";
import { buildCommandMessage, buildMessage } from "../src/message/builder.js";
import { PUZZLE_ENCOURAGEMENT } from "../src/types.js";

const puzzle = {
  type: "puzzle" as const,
  source: "https://example.com/p1",
  body: "题目正文",
  raw: "",
};

describe("buildMessage", () => {
  it("puzzle: title + body + 鼓励语 + source", () => {
    const m = buildMessage(puzzle);
    expect(m.kind).toBe("markdown");
    expect(m.text).toBe(
      `【今日谜题】\n\n题目正文\n\n${PUZZLE_ENCOURAGEMENT}\n\n原题链接：\nhttps://example.com/p1`,
    );
  });

  it("knowledge: title + body, no ending", () => {
    const m = buildMessage({ ...puzzle, type: "knowledge", source: undefined });
    expect(m.text).toBe("【今日知识】\n\n题目正文");
  });

  it("story: title + body, no ending", () => {
    const m = buildMessage({ ...puzzle, type: "story", source: undefined });
    expect(m.text).toBe("【今日故事】\n\n题目正文");
  });

  it("preserves markdown body", () => {
    const body = "## H\n\n- a\n- b";
    expect(buildMessage({ ...puzzle, body }).text).toContain(body);
  });
});

describe("buildCommandMessage", () => {
  it("puzzle unchanged", () => {
    expect(buildCommandMessage(puzzle).text).toBe(buildMessage(puzzle).text);
  });

  it("non-puzzle appends rest note", () => {
    const m = buildCommandMessage({ ...puzzle, type: "knowledge", source: undefined });
    expect(m.text).toMatch(/今天没有谜题，休息一下吧$/);
  });
});
