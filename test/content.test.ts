import { describe, expect, it } from "vitest";
import { ContentService } from "../src/content/service.js";
import { ContentNotFoundError, UpstreamError } from "../src/errors.js";
import { mockFetch } from "./helpers.js";

const BASE = "https://raw.example.com/content";

describe("ContentService", () => {
  it("builds a Beijing date URL and parses content", async () => {
    const url = `${BASE}/2026-08-23.md`;
    const service = new ContentService(BASE, mockFetch({
      [url]: { body: "---\ntype: puzzle\nsource: https://x/p\n---\n题目" },
    }));
    const content = await service.fetchContent(new Date("2026-08-22T16:00:00Z"));
    expect(service.urlFor(new Date("2026-08-22T16:00:00Z"))).toBe(url);
    expect(content).toMatchObject({ type: "puzzle", source: "https://x/p", body: "题目" });
  });

  it("distinguishes missing and upstream errors", async () => {
    const missing = new ContentService(BASE, mockFetch({ [`${BASE}/2026-08-23.md`]: { status: 404 } }));
    await expect(missing.fetchContent(new Date("2026-08-23T00:00:00Z"))).rejects.toBeInstanceOf(ContentNotFoundError);
    const failed = new ContentService(BASE, mockFetch({ [`${BASE}/2026-08-23.md`]: { status: 503 } }));
    await expect(failed.fetchContent(new Date("2026-08-23T00:00:00Z"))).rejects.toBeInstanceOf(UpstreamError);
  });
});
