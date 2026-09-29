import { BRAND_NAME } from "@/lib/config/brand";

/**
 * Words a public name can never contain (decision 31): names are published immediately, even
 * while the model is unavailable, so this list is their last line. Maintained here, lowercase and
 * without accents. Words of five letters or more match anywhere in the name; shorter ones only as a
 * whole part (split on . _ -), so ordinary names that contain them are not caught.
 */
export const BLOCKED_NAME_WORDS = [
  // Pretending to run the game.
  "admin",
  "administrator",
  "moderator",
  "official",
  "support",
  "staff",
  BRAND_NAME.toLowerCase().replace(/[^a-z0-9]/g, ""),
  // Slurs and insults (en, es).
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "tranny",
  "maricon",
  "sudaca",
  "whore",
  "bitch",
  "cunt",
  "fuck",
  "shit",
  "slut",
  "puta",
  "puto",
  "zorra",
  "pendejo",
  "culero",
  "mierda",
  "verga",
  // Hate symbols.
  "nazi",
  "hitler",
  "heilhitler",
  "kkk",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s" };

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[0-9@$]/g, (c) => LEET[c] ?? c);
}

/** True when the name contains a blocked word. */
export function nameIsBlocked(name: string): boolean {
  const normalized = normalize(name);
  const joined = normalized.replace(/[._-]/g, "");
  const parts = normalized.split(/[._-]+/);
  return BLOCKED_NAME_WORDS.some((word) => (word.length >= 5 ? joined.includes(word) : parts.includes(word)));
}
