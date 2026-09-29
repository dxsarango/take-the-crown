/** Display-only mirror of the SQL `rank_for_seconds` thresholds (total reign time). */
export const RANKS = [
  { rank: "peasant", minSeconds: 0 },
  { rank: "knight", minSeconds: 3_600 },
  { rank: "baron", minSeconds: 21_600 },
  { rank: "count", minSeconds: 86_400 },
  { rank: "duke", minSeconds: 259_200 },
  { rank: "emperor", minSeconds: 604_800 },
] as const;

export type Rank = (typeof RANKS)[number]["rank"];

export function rankForSeconds(seconds: number): Rank {
  let current: Rank = "peasant";
  for (const { rank, minSeconds } of RANKS) {
    if (seconds >= minSeconds) current = rank;
  }
  return current;
}

export function isRank(value: unknown): value is Rank {
  return typeof value === "string" && RANKS.some((r) => r.rank === value);
}
