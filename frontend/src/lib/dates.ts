// Date-only strings ("2026-10-06") are calendar days, not moments in time. These helpers keep them in the
// viewer's own calendar so a class on Tuesday never shows up as Monday because of a time-zone shift.

export const parseYmd = (value: string): Date => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const ymd = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** "Tue, 6 Oct 2026" in the language the person uses. */
export const formatDay = (value: string, locale?: string): string =>
  parseYmd(value).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** The seven weekday names, Monday first. Each has its JavaScript day number (0 = Sunday). */
export const weekdayNames = (locale?: string): { day: number; label: string }[] =>
  [1, 2, 3, 4, 5, 6, 0].map((day) => ({
    day,
    // 2024-01-01 was a Monday, so day 1 -> Jan 1, day 0 -> Jan 7
    label: new Date(2024, 0, day === 0 ? 7 : day).toLocaleDateString(locale, { weekday: "short" }),
  }));
