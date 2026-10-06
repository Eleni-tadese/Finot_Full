/**
 * Events are held in Ethiopia, and the times typed into the event form are Ethiopian time. Everything that SHOWS an event time
 * uses these helpers, so it reads the same on every computer, whatever time zone that computer is set to.
 */
const ZONE = "Africa/Addis_Ababa";

const parts = (iso: string, opts: Intl.DateTimeFormatOptions, locale?: string) => new Intl.DateTimeFormat(locale, { timeZone: ZONE, ...opts }).format(new Date(iso));

export const etTime = (iso: string) => parts(iso, { hour: "numeric", minute: "2-digit" });
export const etDate = (iso: string) => parts(iso, { year: "numeric", month: "numeric", day: "numeric" });
export const etDateTime = (iso: string) => parts(iso, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
export const etMonthShort = (iso: string) => parts(iso, { month: "short" }, "en");
export const etDay = (iso: string) => parts(iso, { day: "numeric" }, "en");
/** The current Ethiopian time, e.g. for a hint beside the event form. */
export const etNow = () => etDateTime(new Date().toISOString());
