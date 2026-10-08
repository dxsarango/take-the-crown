/**
 * A fixed-offset IANA zone in which `at` is close to local noon (within half an hour). Reigns are
 * seeded relative to the database clock, so "today" in a spec depends on the hour it runs; in this
 * zone the last eleven hours are always today and everything older is not.
 */
export function zoneAtNoon(at: Date): string {
  const utcHour = at.getUTCHours() + at.getUTCMinutes() / 60;
  const shift = Math.round(12 - utcHour);
  // Etc/GMT zones count the other way: Etc/GMT-3 is three hours ahead of UTC.
  if (shift === 0) return "Etc/GMT";
  return shift > 0 ? `Etc/GMT-${shift}` : `Etc/GMT+${-shift}`;
}
