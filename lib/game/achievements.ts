/** Achievement codes (database) → medal keys used by the design's messages and assets. */
export const MEDAL_KEY = {
  first_blood: "firstBlood",
  regicide: "regicide",
  one_minute_king: "oneMin",
  night_owl: "owl",
  revenge: "revenge",
  guardian_1: "g1",
  guardian_2: "g2",
  guardian_3: "g3",
  bargain_hunter: "bag",
  collector: "collector",
  rivalry: "rivalry",
  patriot: "patriot",
  founder: "founder",
  frostbound: "frostbound",
  remembered: "remembered",
} as const;

export type AchievementCode = keyof typeof MEDAL_KEY;
export type MedalKey = (typeof MEDAL_KEY)[AchievementCode];

export function isAchievementCode(code: unknown): code is AchievementCode {
  return typeof code === "string" && code in MEDAL_KEY;
}
