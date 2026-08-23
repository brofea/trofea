import { describe, expect, it } from "vitest";
import { ContentService } from "../src/content/service.js";
import {
  ContentNotFoundError,
  FrontMatterError,
  UpstreamError,
} from "../src/errors.js";
import { mockFetch } from "./helpers.js";

const BASE = "https://raw.example.com/content/";
const puzzleMd = `---\ntype: puzzle\nsource: https://ex/p\n---\n题目`;
const knowledgeMd = `---\ntype: knowledge\n---\n知识`;

function service(routes: Record<string, { status?: number; body?: string }>) {
  return new ContentService(BASE, mockFetch(routes));
}

describe("ContentService.urlFor", () => {
  it("builds YYYY-MM-DD raw url", () => {
    const s = service({});
    expect(s.urlFor(new Date("2026-08-23T00:00:00Z"))).toBe(
      `${BASE}2026-08-23.md`,
    );
  });
});

describe("ContentService.fetchContent", () => {
  it("parses valid puzzle", async () => {
    const s = service({ [`${BASE}2026-08-23.md`]: { body: puzzleMd } });
    const c = await s.fetchContent(new Date("2026-08-23T00:00:00Z"));
    expect(c.type).toBe("puzzle");
    expect(c.body).toBe("题目");
  });

  it("404 → ContentNotFoundError", async () => {
    const s = service({ [`${BASE}2026-08-23.md`]: { status: 404 } });
    await expect(
      s.fetchContent(new Date("2026-08-23T00:00:00Z")),
    ).rejects.toBeInstanceOf(ContentNotFoundError);
  });

  it("non-2xx → UpstreamError", async () => {
    const s = service({ [`${BASE}2026-08-23.md`]: { status: 500 } });
    await expect(
      s.fetchContent(new Date("2026-08-23T00:00:00Z")),
    ).rejects.toBeInstanceOf(UpstreamError);
  });

  it("network error → UpstreamError", async () => {
    const s = new ContentService(
      BASE,
      mockFetch({}, { networkError: () => new Error("timeout") }),
    );
    await expect(
      s.fetchContent(new Date("2026-08-23T00:00:00Z")),
    ).rejects.toBeInstanceOf(UpstreamError);
  });

  it("empty body → FrontMatterError", async () => {
    const s = service({ [`${BASE}2026-08-23.md`]: { body: "   " } });
    await expect(
      s.fetchContent(new Date("2026-08-23T00:00:00Z")),
    ).rejects.toBeInstanceOf(FrontMatterError);
  });
});
