import { describe, expect, it } from "vitest";
import { parseFrontMatter } from "../src/utils/frontmatter.js";
import { FrontMatterError } from "../src/errors.js";

const fm = (body: string) => `---\n${body}\n---\n正文`;

describe("parseFrontMatter", () => {
  it("parses puzzle with source", () => {
    const md = fm("type: puzzle\nsource: https://example.com/p");
    const c = parseFrontMatter(md);
    expect(c.type).toBe("puzzle");
    expect(c.source).toBe("https://example.com/p");
    expect(c.body).toBe("正文");
    expect(c.raw).toBe(md);
  });

  it("parses knowledge (no source required)", () => {
    const c = parseFrontMatter(fm("type: knowledge"));
    expect(c.type).toBe("knowledge");
    expect(c.source).toBeUndefined();
  });

  it("parses story", () => {
    expect(parseFrontMatter(fm("type: story")).type).toBe("story");
  });

  it("throws on missing front matter", () => {
    expect(() => parseFrontMatter("just text")).toThrow(FrontMatterError);
  });

  it("throws on missing type", () => {
    expect(() => parseFrontMatter(fm("source: x"))).toThrow(/type/);
  });

  it("throws on unknown type", () => {
    expect(() => parseFrontMatter(fm("type: quiz"))).toThrow(/未知 type/);
  });

  it("throws when puzzle has no source", () => {
    expect(() => parseFrontMatter(fm("type: puzzle"))).toThrow(/source/);
  });

  it("throws on malformed YAML", () => {
    expect(() => parseFrontMatter("---\ntype: [unclosed\n---\nbody")).toThrow(
      FrontMatterError,
    );
  });

  it("preserves markdown body verbatim", () => {
    const body = "## 标题\n\n- 列表\n- **加粗**\n\n```js\nconst x=1;\n```";
    const md = `---\ntype: knowledge\n---\n${body}`;
    expect(parseFrontMatter(md).body).toBe(body);
  });
});
