/**
 * Display-only mirror of the SQL `price_at` function. The live price on screen is computed on the
 * client from `public_crown_state`; the amount charged always comes from `create_price_lock`.
 */
export type PriceConfig = {
  floorCents: number;
  decayBpsPerHour: number;
};

const MS_PER_HOUR = 3_600_000;
// Absorbs floating point error so exact results (e.g. 2500 × 0.98 = 2450) don't round up.
const EPSILON = 1e-9;

export function priceAt(baseCents: number, baseSetAt: Date, at: Date, config: PriceConfig): number {
  const hours = Math.max(at.getTime() - baseSetAt.getTime(), 0) / MS_PER_HOUR;
  const decayed = baseCents * Math.pow(1 - config.decayBpsPerHour / 10_000, hours);
  return Math.max(config.floorCents, Math.ceil(decayed - EPSILON));
}
