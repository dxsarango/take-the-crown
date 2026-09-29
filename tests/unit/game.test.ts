import { describe, expect, it } from "vitest";
import { priceAt } from "@/lib/game/price";
import { rankForSeconds } from "@/lib/game/rank";

const config = { floorCents: 500, decayBpsPerHour: 200 };
const t0 = new Date("2026-10-01T00:00:00Z");
const hoursLater = (h: number) => new Date(t0.getTime() + h * 3_600_000);

describe("priceAt", () => {
  it("starts at the base price", () => {
    expect(priceAt(1000, t0, t0, config)).toBe(1000);
  });

  it("decays 2% per hour, compounding, rounded up to the cent", () => {
    expect(priceAt(1000, t0, hoursLater(1), config)).toBe(980);
    expect(priceAt(1000, t0, hoursLater(2), config)).toBe(961);
    expect(priceAt(2500, t0, hoursLater(1), config)).toBe(2450);
  });

  it("never goes below the floor", () => {
    expect(priceAt(600, t0, hoursLater(500), config)).toBe(500);
  });

  it("ignores a base set in the future", () => {
    expect(priceAt(1000, hoursLater(1), t0, config)).toBe(1000);
  });
});

describe("rankForSeconds", () => {
  it.each([
    [0, "peasant"],
    [3_599, "peasant"],
    [3_600, "knight"],
    [21_600, "baron"],
    [86_400, "count"],
    [259_200, "duke"],
    [604_799, "duke"],
    [604_800, "emperor"],
  ])("%i s is %s", (seconds, rank) => {
    expect(rankForSeconds(seconds)).toBe(rank);
  });
});
