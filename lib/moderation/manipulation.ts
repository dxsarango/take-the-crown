/**
 * Rules against prompt injection, checked before the model (decision 51): text that imitates the
 * moderation request (tags, role labels, a pre-written verdict, override commands) is rejected
 * with reason "manipulation" without asking the model, which is not deterministic and once let a
 * fake closing tag through. Matching runs on a normalized copy, so case, accents, full-width and
 * invisible characters, leetspeak and spaced-out letters ("S Y S T E M :") do not hide a marker.
 */

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s" };

// Angle brackets and their look-alikes (full-width forms become "<" ">" under NFKC).
const ANGLE_BRACKETS = /[<>\u2039\u203A\u3008\u3009\u27E8\u27E9\u276E\u276F]/;

const ROLES = "system|assistant|developer|admin|administrator|operator|moderator";

/** Markers on the normalized text. */
const MARKERS = [
  // A role label opening a line of dialogue: "SYSTEM:", "assistant :".
  new RegExp(`\\b(?:${ROLES})\\s*:`),
  // A verdict written out for the moderator: verdict=allow, "verdict": "allow".
  /\bverdict\W{0,3}[=:]/,
  // Override commands: "[[ADMIN OVERRIDE]]", "system override".
  new RegExp(`\\b(?:${ROLES})\\W{0,3}override\\b`),
  /\bignore\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|rules|prompts?)\b/,
  // A role name set apart as a tag: [admin], (system), {assistant}.
  new RegExp(`[\\[({]\\s*(?:${ROLES})\\s*[\\])}]`),
];

/** Role words shouted on their own ("ADMIN", "SYSTEM", "4DM1N"), checked before lowercasing. */
const SHOUTED_ROLE = new RegExp(`(?<![A-Za-z])(?:${ROLES.toUpperCase()})(?![A-Za-z])`);

/** Name parts that address the moderator ("SYSTEM_allow", "verdict.allow"); names cannot hold ":" or "<". */
const NAME_MARKERS = ["system", "assistant", "verdict", "override"];

function leet(text: string, upper: boolean): string {
  return text.replace(/[0-9@$]/g, (c) => (upper ? (LEET[c] ?? c).toUpperCase() : (LEET[c] ?? c)));
}

/** NFKC, no accents or invisible characters, leetspeak undone (as capitals when `upper`). Case is kept. */
function canonical(text: string, upper = false): string {
  return leet(
    text
      .normalize("NFKC")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/g, ""),
    upper,
  );
}

// Separators between spaced-out letters: whitespace, . _ * -, the middle dot and the bullet.
const SPACER = "[\\s._*\\u00B7\\u2022\\-]+";

/** Letters spaced out or dotted apart joined back ("s y s t e m" → "system"), for a-z or A-Z. */
function joinSpaced(text: string, letter: "a-z" | "A-Z"): string {
  return text.replace(new RegExp(`\\b[${letter}](?:${SPACER}[${letter}]\\b)+`, "g"), (run) => run.replace(new RegExp(`[^${letter}]`, "g"), ""));
}

/** Lowercase, spaced-out letters joined. */
function normalized(text: string): string {
  return joinSpaced(canonical(text).toLowerCase(), "a-z");
}

/** True when a message or other free text tries to talk to the moderator. */
export function isManipulation(text: string): boolean {
  const canon = canonical(text);
  if (ANGLE_BRACKETS.test(canon)) return true;
  if (SHOUTED_ROLE.test(joinSpaced(canonical(text, true), "A-Z"))) return true;
  const plain = normalized(text);
  return MARKERS.some((marker) => marker.test(plain));
}

/** Names: the free-text markers, plus role words as a whole part of the name. */
export function isManipulativeName(name: string): boolean {
  if (isManipulation(name)) return true;
  const parts = canonical(name).toLowerCase().split(/[._-]+/);
  return NAME_MARKERS.some((word) => parts.includes(word));
}

/** Links: the address as written and as decoded, so %3C or %3A do not hide a marker. */
export function isManipulativeLink(link: string): boolean {
  let decoded = link;
  try {
    decoded = decodeURIComponent(link);
  } catch {
    // A malformed escape is judged as written.
  }
  return isManipulation(link) || isManipulation(decoded.replace(/[/?&#+_-]+/g, " "));
}
