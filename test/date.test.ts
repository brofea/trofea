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

  it("parses YYYYMMDD format", () => {
    const result = parseDateString("20260825");
    expect(result).not.toBeNull();
    expect(formatDate(result!)).toBe("2026-08-25");
  });

  it("parses MMDD format using current year", () => {
    const now = new Date();
    const currentYear = toBeijingParts(now).year;
    const result = parseDateString("0825");
    expect(result).not.toBeNull();
    expect(formatDate(result!)).toBe(`${currentYear}-08-25`);
  });

  it("rejects invalid dates in YYYYMMDD format", () => {
    expect(parseDateString("20260231")).toBeNull();
  });

  it("rejects invalid dates in MMDD format", () => {
    expect(parseDateString("0231")).toBeNull();
    expect(parseDateString("1301")).toBeNull();
  });
});
