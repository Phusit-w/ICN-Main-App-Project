// A Project Card's Certificate Date (app/(app)/project-card/CONTEXT.md): the
// date written on its Work Certificate. Stored as a Postgres DATE, which
// Prisma hands back as UTC midnight of that day — every helper here works in
// UTC so the day never shifts. No server-only imports: the popup uses these.

// Same Gregorian range as a card's Year (lib/project-card.ts).
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

// The age choices on ค้นหาโครงการ's "หนังสือรับรองออกภายใน" filter, in years.
export const CERTIFICATE_AGE_OPTIONS = [1, 3, 5, 10] as const;

// "YYYY-MM-DD" (Gregorian, as pushed and as <input type="date"> sends it) →
// that day, or null for anything else, including a day that doesn't exist.
export function parseCertificateDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

// The value an <input type="date"> takes; null stays null.
export function certificateDateValue(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

// "12 มี.ค. 2567": th-TH counts years in the Buddhist era.
export function formatCertificateDate(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

// The earliest Certificate Date still within the last `years` years, counted
// back from today's date in Bangkok. 29 Feb counts back to 1 Mar.
export function certificateDatedSince(years: number, now: Date = new Date()): Date {
  // en-CA writes YYYY-MM-DD.
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now).split("-").map(Number);
  return new Date(Date.UTC(year - years, month - 1, day));
}
