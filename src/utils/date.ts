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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) || formatDate(date) !== value ? null : date;
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * 24 * 60 * 60 * 1000);
}
