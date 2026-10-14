import i18n from '@/i18n';

// Events are held in Ethiopia and the times typed on the website are Ethiopian time.
// Ethiopia is UTC+3 all year (no daylight saving), so we add 3 hours ourselves and read the UTC parts.
// This gives the same answer on every phone, whatever time zone the phone is set to.
const OFFSET_MS = 3 * 60 * 60 * 1000;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shifted(iso: string): Date {
  return new Date(new Date(iso).getTime() + OFFSET_MS);
}

// "2:30 PM"
export function etTime(iso: string): string {
  const d = shifted(iso);
  const hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

// Month names are only written in English. For Amharic and Afaan Oromoo we show plain numbers (14/10/2026),
// which are the same in every language, instead of guessing month names.
const isEnglish = () => i18n.language === 'en';

// "Tue 14 Oct 2026"  (or "14/10/2026")
export function etDate(iso: string): string {
  const d = shifted(iso);
  if (!isEnglish()) return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// "Tue 14 Oct 2026, 2:30 PM"
export function etDateTime(iso: string): string {
  return `${etDate(iso)}, ${etTime(iso)}`;
}

// "14" and "Oct": used for the little date badge on event cards
export function etDay(iso: string): string {
  return String(shifted(iso).getUTCDate());
}

export function etMonthShort(iso: string): string {
  const month = shifted(iso).getUTCMonth();
  return isEnglish() ? MONTHS[month] : String(month + 1);
}

// For plain dates such as "2026-10-14" (a class day has a date but no time).
// We read the three numbers ourselves, so no time zone can move the day.
export function plainDate(dateText: string): string {
  const [year, month, day] = dateText.split('-').map(Number);
  if (!isEnglish()) return `${day}/${month}/${year}`;
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${DAYS[d.getUTCDay()]} ${day} ${MONTHS[month - 1]} ${year}`;
}

// Today's date in Ethiopia as "2026-10-14", to compare with class-day dates.
export function etToday(): string {
  return new Date(Date.now() + OFFSET_MS).toISOString().slice(0, 10);
}
