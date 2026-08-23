import { describe, expect, it } from "vitest";
import { formatDate, toBeijingParts } from "../src/utils/date.js";

// 固定 UTC 时刻验证北京时区换算。
// 2026-08-23T00:30:00Z → 北京 08:30，周日。
const SUNDAY_MORNING_UTC = new Date("2026-08-23T00:30:00Z");
// 2026-08-21T22:00:00Z → 北京 2026-08-22 06:00，周六。
const SAT_EVENING_UTC = new Date("2026-08-21T22:00:00Z");

describe("toBeijingParts", () => {
  it("maps UTC to UTC+8", () => {
    const p = toBeijingParts(SUNDAY_MORNING_UTC);
    expect(p.year).toBe(2026);
    expect(p.month).toBe(8);
    expect(p.day).toBe(23);
    expect(p.hours).toBe(8);
    expect(p.minutes).toBe(30);
    expect(p.weekday).toBe(0);
  });
});

describe("formatDate", () => {
  it("formats YYYY-MM-DD in Beijing time", () => {
    expect(formatDate(SUNDAY_MORNING_UTC)).toBe("2026-08-23");
    expect(formatDate(SAT_EVENING_UTC)).toBe("2026-08-22");
  });
});
