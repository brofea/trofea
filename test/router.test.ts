import { describe, expect, it } from "vitest";
import { CommandRouter } from "../src/commands/router.js";
import { ContentService } from "../src/content/service.js";
import { mockFetch } from "./helpers.js";

const BASE = "https://raw.example.com/content/";
const TODAY = new Date("2026-08-23T00:00:00Z");

function router(routes: Record<string, { status?: number; body?: string }>, today = TODAY) {
  return new CommandRouter({
    content: new ContentService(BASE, mockFetch(routes)),
    today,
    log: () => {},
  });
}

describe("CommandRouter", () => {
  it("/今日谜题 with puzzle today → puzzle message", async () => {
    const r = await router({
      [`${BASE}2026-08-23.md`]: { body: "---\ntype: puzzle\nsource: https://x/p\n---\n题" },
    }).handle("/今日谜题");
    expect(r?.message.text).toContain("【今日谜题】");
    expect(r?.message.text).toContain("原题链接：\nhttps://x/p");
  });

  it("/今日谜题 with knowledge today → appends rest note", async () => {
    const r = await router({
      [`${BASE}2026-08-23.md`]: { body: "---\ntype: knowledge\n---\nk" },
    }).handle("/今日谜题");
    expect(r?.message.text).toContain("【今日知识】");
    expect(r?.message.text).toMatch(/今天没有谜题，休息一下吧$/);
  });

  it("/今日谜题 when no content → rest message", async () => {
    const r = await router({
      [`${BASE}2026-08-23.md`]: { status: 404 },
    }).handle("/今日谜题");
    expect(r?.message.text).toContain("休息一下吧");
  });

  it("unknown command returns null", async () => {
    expect(await router({}).handle("/unknown")).toBeNull();
  });

  it("non-command text returns null", async () => {
    expect(await router({}).handle("hello there")).toBeNull();
  });
});
