import { priceAt } from "@/lib/game/price";
import type { CrownState } from "./data";

export type HeroMode = "empty" | "locked" | "floor" | "normal";

export type HeroState = {
  mode: HeroMode;
  priceCents: number;
  /** Seconds the current king has reigned; 0 on an empty throne. */
  reignSeconds: number;
  /** Seconds left on someone else's price lock; 0 when unlocked. */
  lockSecondsLeft: number;
};

/**
 * What the throne shows at `now` (server-corrected milliseconds). The price uses the same formula
 * as SQL price_at; while someone holds a lock it stays at the locked price.
 */
export function heroState(crown: CrownState, kingStartedAt: string | null, now: number): HeroState {
  const config = { floorCents: crown.floorCents, decayBpsPerHour: crown.decayBpsPerHour };
  const baseSetAt = new Date(crown.baseSetAt);
  const lockEnds = crown.lockExpiresAt ? new Date(crown.lockExpiresAt).getTime() : 0;
  const lockSecondsLeft = crown.isLocked && lockEnds > now ? (lockEnds - now) / 1000 : 0;

  const priceCents =
    lockSecondsLeft > 0
      ? priceAt(crown.basePriceCents, baseSetAt, new Date(lockEnds - crown.lockSeconds * 1000), config)
      : priceAt(crown.basePriceCents, baseSetAt, new Date(now), config);

  const reignSeconds = kingStartedAt ? Math.max(0, (now - new Date(kingStartedAt).getTime()) / 1000) : 0;

  const mode: HeroMode =
    lockSecondsLeft > 0 ? "locked" : !kingStartedAt ? "empty" : priceCents <= crown.floorCents ? "floor" : "normal";

  return { mode, priceCents, reignSeconds, lockSecondsLeft };
}

/** Number of lit segments in the 20-segment lock bar (15 s each for a 5:00 lock). */
export function lockSegments(secondsLeft: number, lockSeconds: number, segments = 20): number {
  return Math.min(segments, Math.ceil(secondsLeft / (lockSeconds / segments)));
}

/**
 * Offset to add to Date.now() to get server time, from one round trip: the server's clock is
 * assumed to have been read halfway between sending and receiving.
 */
export function clockOffset(sentAt: number, receivedAt: number, serverNow: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}
