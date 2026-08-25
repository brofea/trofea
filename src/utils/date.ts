export const BEIJING_OFFSET_MINUTES = 8 * 60;

export function toBeijingParts(date: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hours: number;
  minutes: number;
} {
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

export function formatDate(date: Date): string {
  const parts = toBeijingParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseDateString(value: string): Date | null {
  // YYYYMMDD format (8 digits)
  if (/^\d{8}$/.test(value)) {
    const formatted = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    return parseDateString(formatted);
  }
  
  // MMDD format (4 digits) - use current year
  if (/^\d{4}$/.test(value)) {
    const now = new Date();
    const currentYear = toBeijingParts(now).year;
    const formatted = `${currentYear}-${value.slice(0, 2)}-${value.slice(2, 4)}`;
    return parseDateString(formatted);
  }
  
  // YYYY-MM-DD format (standard)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) || formatDate(date) !== value ? null : date;
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * 24 * 60 * 60 * 1000);
}
