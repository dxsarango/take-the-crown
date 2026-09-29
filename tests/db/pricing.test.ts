import { describe, expect, it } from "vitest";
import { priceAt } from "@/lib/game/price";
import { RANKS, rankForSeconds } from "@/lib/game/rank";
import { one, q, withFreshGame } from "./helpers";

withFreshGame();

// Deterministic pseudo-random samples so failures are reproducible.
function* samples(n: number): Generator<{ base: number; hours: number; floor: number; decay: number }> {
  let seed = 42;
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const floors = [500, 100, 1000];
  const decays = [200, 50, 1000];
  for (let i = 0; i < n; i++) {
    yield {
      base: 100 + Math.floor(next() * 200_000),
      // Include whole hours, where exact decimal results expose rounding differences.
      hours: i % 4 === 0 ? Math.floor(next() * 200) : next() * 200,
      floor: floors[i % floors.length],
      decay: decays[i % decays.length],
    };
  }
}

describe("price_at", () => {
  it("matches the TypeScript display formula", async () => {
    const setAt = new Date("2026-10-01T00:00:00Z");
    const mismatches: string[] = [];
    for (const sample of samples(400)) {
      await q("update app_config set floor_cents = $1, decay_bps_per_hour = $2", [sample.floor, sample.decay]);
      const at = new Date(setAt.getTime() + Math.round(sample.hours * 3_600_000));
      const { price } = await one<{ price: number }>("select price_at($1, $2, $3) as price", [sample.base, setAt, at]);
      const local = priceAt(sample.base, setAt, at, { floorCents: sample.floor, decayBpsPerHour: sample.decay });
      if (price !== local) mismatches.push(`${JSON.stringify(sample)}: sql ${price}, ts ${local}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("matches the TypeScript display formula every 37 s across a 120 h reign", async () => {
    const setAt = new Date("2026-10-01T00:00:00.000Z");
    for (const base of [500, 600, 3400, 12_345, 250_000]) {
      const rows = await q<{ at: Date; price: number }>(
        `select at, price_at($1, $2, at) as price
         from generate_series($2::timestamptz, $2::timestamptz + interval '120 hours', interval '37 seconds') as at`,
        [base, setAt],
      );
      const mismatches = rows.filter(
        (row) => row.price !== priceAt(base, setAt, row.at, { floorCents: 500, decayBpsPerHour: 200 }),
      );
      expect(rows.length).toBeGreaterThan(11_000);
      expect(mismatches.map((m) => `${base} @ ${m.at.toISOString()}: sql ${m.price}`)).toEqual([]);
    }
  });

  it("reports the live price in public_crown_state", async () => {
    await q("update crown_state set base_price_cents = 1000, base_set_at = now() - interval '1 hour'");
    const state = await one<{ price_cents: number }>("select price_cents from public_crown_state");
    expect(state.price_cents).toBe(980);
  });
});

describe("rank_for_seconds", () => {
  it("matches the TypeScript thresholds at every boundary", async () => {
    for (const { minSeconds } of RANKS) {
      for (const seconds of [minSeconds - 1, minSeconds, minSeconds + 1].filter((s) => s >= 0)) {
        const { rank } = await one<{ rank: string }>("select rank_for_seconds($1) as rank", [seconds]);
        expect(rank, `${seconds} s`).toBe(rankForSeconds(seconds));
      }
    }
  });
});
