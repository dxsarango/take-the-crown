import { describe, expect, it } from "vitest";
import { zoneAtNoon } from "../../e2e/fixtures/clock";

function localHour(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(at);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return value("hour") + value("minute") / 60;
}

describe("zoneAtNoon", () => {
  it("puts any time of the day within half an hour of local noon", () => {
    for (let minute = 0; minute < 24 * 60; minute += 5) {
      const at = new Date(Date.UTC(2026, 9, 8, 0, minute));
      const hour = localHour(at, zoneAtNoon(at));
      expect(hour, at.toISOString()).toBeGreaterThanOrEqual(11.5);
      expect(hour, at.toISOString()).toBeLessThanOrEqual(12.5);
    }
  });

  it("names a zone the browser knows", () => {
    for (const iso of ["2026-10-08T00:00:00Z", "2026-10-08T05:12:00Z", "2026-10-08T12:00:00Z", "2026-10-08T23:59:00Z"]) {
      const zone = zoneAtNoon(new Date(iso));
      expect(() => new Intl.DateTimeFormat("en", { timeZone: zone })).not.toThrow();
    }
  });
});
