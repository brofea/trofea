/**
 * 北京时间（UTC+8）日期工具。
 *
 * Cloudflare Cron 使用 UTC 表达式（见 wrangler.jsonc 的注释），
 * 代码内统一以 UTC+8 解释“今天”，确保 `YYYY-MM-DD.md` 与用户日历一致。
 */

export const BEIJING_OFFSET_MINUTES = 8 * 60;

/** 将 Date 视为 UTC+8 解释，返回该时区下的组件。 */
export function toBeijingParts(date: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0=周日 ... 6=周六
  hours: number;
  minutes: number;
} {
  const ms = date.getTime() + BEIJING_OFFSET_MINUTES * 60_000;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
  };
}

/** 格式化为 `YYYY-MM-DD`，输入按 UTC+8 解释。 */
export function formatDate(date: Date): string {
  const p = toBeijingParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
