export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function aYearFromNow() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

/** "2026-10-12" as "12 October 2026", for sentences. Tables keep the ISO date. */
export function longDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('en-GB', { dateStyle: 'long', timeZone: 'UTC' });
}
