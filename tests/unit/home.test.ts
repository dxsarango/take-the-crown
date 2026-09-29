import { describe, expect, it } from "vitest";
import {
  clockParts,
  daysLeft,
  displayLink,
  formatAgo,
  formatCountdown,
  formatDuration,
  formatPercent,
  formatPrice,
} from "@/lib/format";
import type { CrownState } from "@/lib/home/data";
import { clockOffset, heroState, lockSegments } from "@/lib/home/hero";

const T0 = Date.parse("2026-10-10T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3_600_000;

const crown = (overrides: Partial<CrownState> = {}): CrownState => ({
  seasonId: 0,
  currentReignId: 1,
  basePriceCents: 1000,
  baseSetAt: iso(T0),
  isLocked: false,
  lockExpiresAt: null,
  floorCents: 500,
  decayBpsPerHour: 200,
  lockSeconds: 300,
  maxMessageLength: 80,
  ...overrides,
});

describe("heroState", () => {
  it("shows the decaying price and the reign time", () => {
    const state = heroState(crown(), iso(T0 - 90_000), T0 + HOUR);
    expect(state).toMatchObject({ mode: "normal", priceCents: 980, lockSecondsLeft: 0 });
    expect(state.reignSeconds).toBe(3690);
  });

  it("shows the empty throne", () => {
    expect(heroState(crown({ currentReignId: null, basePriceCents: 500 }), null, T0)).toMatchObject({
      mode: "empty",
      priceCents: 500,
      reignSeconds: 0,
    });
  });

  it("shows the floor once the price reaches it", () => {
    expect(heroState(crown(), iso(T0), T0 + 200 * HOUR)).toMatchObject({ mode: "floor", priceCents: 500 });
  });

  it("freezes the price at the locked value while someone holds a lock", () => {
    const lockedAt = T0 + HOUR;
    const locked = crown({ isLocked: true, lockExpiresAt: iso(lockedAt + 300_000) });
    const state = heroState(locked, iso(T0), lockedAt + 120_000);
    expect(state.mode).toBe("locked");
    expect(state.priceCents).toBe(980);
    expect(state.lockSecondsLeft).toBe(180);
  });

  it("drops the lock state as soon as the lock expires, without waiting for the server", () => {
    const locked = crown({ isLocked: true, lockExpiresAt: iso(T0 + 1000) });
    expect(heroState(locked, iso(T0), T0 + 1001).mode).toBe("normal");
  });
});

describe("lockSegments", () => {
  it.each([
    [300, 20],
    [285, 19],
    [284, 19],
    [15, 1],
    [0.5, 1],
    [0, 0],
  ])("%s s left lights %s segments", (seconds, lit) => {
    expect(lockSegments(seconds, 300)).toBe(lit);
  });
});

describe("clockOffset", () => {
  it("assumes the server read its clock halfway through the round trip", () => {
    expect(clockOffset(1000, 1200, 5000)).toBe(3900);
    expect(clockOffset(1000, 1000, 1000)).toBe(0);
  });
});

describe("format", () => {
  const units = { h: "h", m: "m", s: "s" };

  it("formats prices per locale in USD", () => {
    expect(formatPrice(3400, "en")).toBe("$34");
    expect(formatPrice(3450, "en")).toBe("$34.50");
    expect(formatPrice(3400, "es")).toBe("$34");
    expect(formatPrice(123456, "en")).toBe("$1,234.56");
  });

  it("formats basis points as a percentage", () => {
    expect(formatPercent(200, "en")).toBe("2%");
    expect(formatPercent(250, "es")).toMatch(/^2[.,]5\s?%$/);
  });

  it.each([
    [38, "38s"],
    [47 * 60 + 5, "47m"],
    [3 * 3600 + 12 * 60, "3h 12m"],
    [11 * 3600 + 5 * 60, "11h 05m"],
    [31 * 3600 + 7 * 60, "31h 07m"],
  ])("formats a %i s reign as %s", (seconds, text) => {
    expect(formatDuration(seconds, units)).toBe(text);
  });

  it("splits the live clock", () => {
    expect(clockParts(5 * 3600 + 41 * 60 + 9.8)).toEqual({ h: "5", m: "41", s: "09" });
    expect(clockParts(0)).toEqual({ h: "0", m: "00", s: "00" });
  });

  it("formats the lock countdown", () => {
    expect(formatCountdown(300)).toBe("5:00");
    expect(formatCountdown(272.2)).toBe("4:33");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("counts days left in the season", () => {
    expect(daysLeft(iso(T0 + 34 * 24 * HOUR), T0)).toBe(34);
    expect(daysLeft(iso(T0 + HOUR), T0)).toBe(1);
    expect(daysLeft(iso(T0 - HOUR), T0)).toBe(0);
  });

  it("formats relative times", () => {
    expect(formatAgo(iso(T0 - 5 * HOUR), T0, "en")).toBe("5h ago");
    expect(formatAgo(iso(T0 - 5 * HOUR), T0, "es")).toBe("hace 5 h");
    expect(formatAgo(iso(T0 - 20_000), T0, "en")).toBe("1m ago");
  });

  it("shortens links for display", () => {
    expect(displayLink("https://www.pesito.app/")).toBe("pesito.app");
    expect(displayLink("https://x.com/ana")).toBe("x.com/ana");
  });
});
