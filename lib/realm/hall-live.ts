import type { HallRow, HallScope } from "./data";

/** The reign in progress: the only one whose length keeps growing after the hall was read. */
export type LiveReign = { profileId: string; countryCode: string | null; startedAt: string };

const byValueDesc = (a: HallRow, b: HallRow) => b.value - a.value;

/**
 * The hall is cached, and a cache entry can be served long after it was read, but the reign in
 * progress keeps counting. Rank it from its start time, like the home timer does: the longest
 * record takes the larger of the stored value and the live length, and a country gains the time
 * its king has reigned since the hall was read.
 */
export function withLiveReign(scope: HallScope, live: LiveReign | null, nowMs: number, readAtMs: number): HallScope {
  if (!live) return scope;
  const startedMs = Date.parse(live.startedAt);
  const elapsed = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const sinceRead = Math.max(0, Math.floor((nowMs - Math.max(readAtMs, startedMs)) / 1000));

  const longest = scope.tabs.longest
    .map((row): HallRow => (row.kind === "person" && row.person.profileId === live.profileId ? { ...row, value: Math.max(row.value, elapsed) } : row))
    .sort(byValueDesc);
  const countries = scope.tabs.countries
    .map((row): HallRow => (row.kind === "country" && row.countryCode === live.countryCode ? { ...row, value: row.value + sinceRead } : row))
    .sort(byValueDesc);
  return { tabs: { ...scope.tabs, longest, countries } };
}
