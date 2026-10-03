import { type CivilDate, daysInMonth } from '../../shared/schemas';

export type CivilDateParts = { year: number; month: number; day: number };

export function parseCivilDate(value: string): CivilDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatCivilDate(parts: CivilDateParts): CivilDate {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day,
  ).padStart(2, '0')}`;
}

/** Adds whole months, keeping the original day and clamping to the target month. */
export function addMonthsClamped(date: CivilDate, months: number): CivilDate {
  const parts = parseCivilDate(date);
  if (!parts) throw new Error('invalid_date');
  const total = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return formatCivilDate({ year, month, day });
}

export function compareCivilDate(a: CivilDate, b: CivilDate): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function yearOf(date: CivilDate): number {
  return Number(date.slice(0, 4));
}

/** Maps a civil date to another year by month/day, 29/02 -> 28/02 when needed. */
export function translateCivilDate(date: CivilDate, targetYear: number): CivilDate {
  const parts = parseCivilDate(date);
  if (!parts) throw new Error('invalid_date');
  const day = Math.min(parts.day, daysInMonth(targetYear, parts.month));
  return formatCivilDate({ year: targetYear, month: parts.month, day });
}
