import type { Rarity } from "@/lib/profile/public";
import { artSet } from "@/lib/art/seasons";

/** Rarity colors from design/tokens. */
export const RARITY_HEX: Record<Exclude<Rarity, "seasonal">, string> = {
  common: "#9AA3AE",
  rare: "#4A90E2",
  epic: "#9B5DE5",
  legendary: "#F2C14E",
};

/** Seasonal rings take the color of the season the medal comes from, not the current one. */
export const SEASON_RING_HEX: Record<number, string> = { 0: "#4FA39B", 1: "#F28C28" };

export function rarityHex(rarity: Rarity, seasonId: number | null): string {
  return rarity === "seasonal" ? (SEASON_RING_HEX[artSet(seasonId ?? 0)] ?? SEASON_RING_HEX[0]) : RARITY_HEX[rarity];
}
