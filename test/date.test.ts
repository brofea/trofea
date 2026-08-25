import { describe, expect, it } from "vitest";
import { formatDate, parseDateString, toBeijingParts } from "../src/utils/date.js";

describe("Beijing date helpers", () => {
  it("uses Asia/Shanghai calendar date", () => {
    const date = new Date("2026-08-22T16:30:00Z");
    expect(formatDate(date)).toBe("2026-08-23");
    expect(toBeijingParts(date).weekday).toBe(0);
  });

  it("strictly parses real YYYY-MM-DD dates", () => {
    expect(parseDateString("2026-08-23")).not.toBeNull();
    expect(parseDateString("2026-02-31")).toBeNull();
    expect(parseDateString("2026-8-3")).toBeNull();
  });
});
