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

// "Tue 14 Oct 2026"
export function etDate(iso: string): string {
  const d = shifted(iso);
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
  return MONTHS[shifted(iso).getUTCMonth()];
}
