// Class days are calendar dates ("2026-10-26"), not moments. These helpers do the arithmetic on the three numbers
// with UTC so a phone's time zone can never move a date by one day.

export function ymd(date: Date): string {
  // from a LOCAL date the person picked: use its local year, month and day
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function parseYmd(text: string): { y: number; m: number; d: number } {
  const [y, m, d] = text.split('-').map(Number);
  return { y, m, d };
}

// A local Date at noon for a "YYYY-MM-DD" text (noon is far from any midnight shift), for the date picker.
export function toLocalDate(text: string): Date {
  const { y, m, d } = parseYmd(text);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function addDaysYmd(text: string, n: number): string {
  const { y, m, d } = parseYmd(text);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// 0 = Sunday ... 6 = Saturday, like JavaScript's getDay().
export function weekdayOf(text: string): number {
  const { y, m, d } = parseYmd(text);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Every date from `from` to `to` (included) that falls on one of the weekdays; at most 400 days are looked at.
export function datesOnWeekdays(from: string, to: string, weekdays: number[]): string[] {
  const out: string[] = [];
  if (weekdays.length === 0 || from > to) return out;
  let day = from;
  for (let guard = 0; day <= to && guard < 400; guard++) {
    if (weekdays.includes(weekdayOf(day))) out.push(day);
    day = addDaysYmd(day, 1);
  }
  return out;
}
