import { describe, expect, it } from "vitest";
import { FrontMatterError } from "../src/errors.js";
import { parseFrontMatter } from "../src/utils/frontmatter.js";

describe("parseFrontMatter", () => {
  it("parses all supported types and preserves the body", () => {
    const body = "## 标题\n\n- 内容";
    expect(parseFrontMatter(`---\ntype: knowledge\n---\n${body}`)).toMatchObject({ type: "knowledge", body });
    expect(parseFrontMatter("---\ntype: story\n---\n故事").type).toBe("story");
    expect(parseFrontMatter("---\ntype: puzzle\nsource: https://x\n---\n谜题").source).toBe("https://x");
  });

  it("rejects invalid front matter", () => {
    expect(() => parseFrontMatter("正文")).toThrow(FrontMatterError);
    expect(() => parseFrontMatter("---\ntype: puzzle\n---\n谜题")).toThrow(/source/);
    expect(() => parseFrontMatter("---\ntype: unknown\n---\nx")).toThrow(/未知 type/);
  });
});
