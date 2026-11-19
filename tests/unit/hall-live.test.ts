import { describe, expect, it } from "vitest";
import type { Person } from "@/lib/home/data";
import type { HallRow, HallScope } from "@/lib/realm/data";
import { withLiveReign } from "@/lib/realm/hall-live";

const T0 = Date.parse("2026-10-10T12:00:00Z");
const HOUR = 3600;
const person = (id: string) => ({ profileId: id, name: id }) as Person;
const scope = (longest: HallRow[], countries: HallRow[] = []): HallScope => ({
  tabs: { longest, most: [], shortest: [], countries },
});
const live = { profileId: "king", countryCode: "EC", startedAt: new Date(T0 - 25 * HOUR * 1000).toISOString() };

describe("withLiveReign", () => {
  it("counts the reign in progress from its start, not from when the hall was read", () => {
    const stale = scope([{ kind: "person", person: person("king"), value: 24 * HOUR }]);
    const now = T0 + 1 * HOUR * 1000;
    const out = withLiveReign(stale, live, now, T0 - 1 * HOUR * 1000);
    expect(out.tabs.longest[0]?.value).toBe(26 * HOUR);
  });

  it("keeps a longer past reign of the same king and re-ranks the others", () => {
    const rows: HallRow[] = [
      { kind: "person", person: person("rival"), value: 26 * HOUR },
      { kind: "person", person: person("king"), value: 20 * HOUR },
    ];
    const out = withLiveReign(scope(rows), live, T0 + 2 * HOUR * 1000, T0);
    expect(out.tabs.longest.map((r) => (r.kind === "person" ? r.person.profileId : ""))).toEqual(["king", "rival"]);
    const past: HallRow[] = [{ kind: "person", person: person("king"), value: 90 * HOUR }];
    expect(withLiveReign(scope(past), live, T0, T0).tabs.longest[0]?.value).toBe(90 * HOUR);
  });

  it("adds only the time since the read to the king's country", () => {
    const countries: HallRow[] = [
      { kind: "country", countryCode: "PE", value: 30 * HOUR, kings: 2 },
      { kind: "country", countryCode: "EC", value: 29 * HOUR, kings: 1 },
    ];
    const out = withLiveReign(scope([], countries), live, T0 + 2 * HOUR * 1000, T0);
    expect(out.tabs.countries.map((r) => (r.kind === "country" ? [r.countryCode, r.value] : []))).toEqual([
      ["EC", 31 * HOUR],
      ["PE", 30 * HOUR],
    ]);
  });

  it("leaves the hall alone when nobody holds the crown", () => {
    const s = scope([{ kind: "person", person: person("a"), value: 5 }]);
    expect(withLiveReign(s, null, T0, T0)).toBe(s);
  });
});
