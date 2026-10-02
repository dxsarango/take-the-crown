import { AVATAR_SIZE } from "./avatar";

/**
 * The plain silhouette deleted accounts show instead of their avatar (design/assets/avatar/
 * former-king.svg, checked against the file in tests/unit/art.test.ts).
 */
const PALETTE = ["#2A2438", "#24212C", "#57525F", "#45404F", "#3E3A48"];

const ROWS = [
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaabbbbbbbbaaaaaaaaaaaa",
  "aaaaaaaaaabbccccccccbbaaaaaaaaaa",
  "aaaaaaaaabccccccccccccbaaaaaaaaa",
  "aaaaaaaabccccccccccccccbaaaaaaaa",
  "aaaaaaabccccccccccccccccbaaaaaaa",
  "aaaaaaabcccccccccccccccdbaaaaaaa",
  "aaaaaaabcccccccccccccccdbaaaaaaa",
  "aaaaaaabcccccccccccccccdbaaaaaaa",
  "aaaaaaabcccccccccccccccdbaaaaaaa",
  "aaaaaaabcccccccccccccccdbaaaaaaa",
  "aaaaaaabcccccccccccccccdbaaaaaaa",
  "aaaaaaabcccccccccccccccdbaaaaaaa",
  "aaaaaaabcccccccccccccccdbaaaaaaa",
  "aaaaaaaabcccccccccccccdbaaaaaaaa",
  "aaaaaaaabcccccccccccccdbaaaaaaaa",
  "aaaaaaaaabcccccccccccdbaaaaaaaaa",
  "aaaaaaaaaabcccccccccdbaaaaaaaaaa",
  "aaaaaaaaaaabcdddddddbaaaaaaaaaaa",
  "aaaaaaaaaaaabbbbbbbbaaaaaaaaaaaa",
  "aaaaaaaaabbbbeeeeeebbbbaaaaaaaaa",
  "aaaaaaabbccccbbbbbbccccbbaaaaaaa",
  "aaaaabbccccccccccccccccccbbaaaaa",
  "aaabbccccccccccccccccccccccbbaaa",
  "aabccccccccccccccccccccccccccbaa",
  "abccccccccccccccccccccccccccccba",
  "acacacacacacacacacacacacacacacab",
  "cacacacacacacacacacacacacacacaca",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
];

export const FORMER_KING_PIXELS: (string | null)[] = ROWS.flatMap((row) =>
  [...row].map((c) => (c === "." ? null : PALETTE["abcdefghijklmnop".indexOf(c)])),
);

if (FORMER_KING_PIXELS.length !== AVATAR_SIZE * AVATAR_SIZE) throw new Error("former king art is not 32×32");
