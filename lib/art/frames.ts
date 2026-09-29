import type { Rank } from "@/lib/game/rank";
import type { Pixels } from "./avatar";

// Port of frameCol() from design/prototypes/throne-lib.js. Rank frames are 44×44 with a 6 px band;
// the 32×32 avatar sits at (6, 6). Tests compare the output with design/assets/frames.

type Ramp = { o: string; s1: string; b: string; h: string };

const RAMPS = {
  gold: { o: "#5A3A12", s1: "#C9962C", b: "#F2C14E", h: "#F7D57F" },
  silver: { o: "#3E4452", s1: "#8E96A4", b: "#C3C8D0", h: "#E4E8EE" },
  iron: { o: "#1E2230", s1: "#4A5060", b: "#6E7480", h: "#A4AAB6" },
  wood: { o: "#3A2214", s1: "#6E4428", b: "#8A5A34", h: "#A8744A" },
  crimson: { o: "#3A0A14", s1: "#6E1626", b: "#9A1F35", h: "#D24660" },
  blue: { o: "#16284A", s1: "#3566B0", b: "#4A90E2", h: "#8CC0F2" },
} satisfies Record<string, Ramp>;

/** Frame material and the swatch shown in rank tags. */
export const RANK_STYLE: Record<Rank, { ramp: Ramp; swatch: string }> = {
  peasant: { ramp: RAMPS.wood, swatch: "#8A5A34" },
  knight: { ramp: RAMPS.iron, swatch: "#6E7480" },
  baron: { ramp: RAMPS.silver, swatch: "#C3C8D0" },
  count: { ramp: RAMPS.silver, swatch: "#C3C8D0" },
  duke: { ramp: RAMPS.gold, swatch: "#F2C14E" },
  emperor: { ramp: RAMPS.gold, swatch: "#F2C14E" },
};

export const FRAME_SIZE = 44;
const S = FRAME_SIZE;

type Tone = keyof Ramp;
type Stamp = (Tone | null)[][];

const GEM: Stamp = [
  ["o", "b", "b", "o"],
  ["b", "h", "b", "s1"],
  ["b", "b", "s1", "s1"],
  ["o", "s1", "s1", "o"],
];
const STUD: Stamp = [
  ["h", "b"],
  ["b", "s1"],
];
const RING: Stamp = [".##.", "#..#", "#..#", ".##."].map((row) => [...row].map((c) => (c === "#" ? "o" : null)));
const PLATE: Stamp = [
  ["b", "b", "b", "b"],
  ["b", "h", "h", "b"],
  ["b", "h", "s1", "b"],
  ["b", "b", "b", "b"],
];
const KNIGHT_CORNER: Stamp = [
  [null, null, null, null],
  [null, "h", "b", null],
  [null, "b", "s1", null],
  [null, null, null, null],
];
const ARM = ["......", "###..#", "...##.", "......"];

/** Rank frame with the avatar (or nothing) inside. */
export function framePixels(rank: Rank, avatar: Pixels | null): Pixels {
  const P = RANK_STYLE[rank].ramp;
  const col: Pixels = new Array(S * S).fill(null);
  if (avatar) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) col[(y + 6) * S + x + 6] = avatar[y * 32 + x];
  }

  const ring = (x: number, y: number) => Math.min(x, y, S - 1 - x, S - 1 - y);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = ring(x, y);
      if (r > 5) continue;
      const i = y * S + x;
      if (r === 0 || r === 5) {
        col[i] = P.o;
        continue;
      }
      const top = y === r;
      const left = x === r;
      const bottom = S - 1 - y === r;
      const right = S - 1 - x === r;
      col[i] = (r === 1 && (bottom || right)) || (r === 4 && (top || left)) ? P.s1 : P.b;
    }
  }

  const put = (x: number, y: number, c: string) => {
    col[y * S + x] = c;
  };
  const side = (t: number, r: number, c: string) => {
    put(t, r, c);
    put(t, S - 1 - r, c);
    put(r, t, c);
    put(S - 1 - r, t, c);
  };
  const both = (t: number, r: number, c: string) => {
    side(t, r, c);
    side(S - 1 - t, r, c);
  };
  const stamp = (pattern: Stamp, ox: number, oy: number, ramp: Ramp = P) =>
    pattern.forEach((row, y) =>
      row.forEach((tone, x) => {
        if (tone) put(ox + x, oy + y, ramp[tone]);
      }),
    );
  const corners = (pattern: Stamp, ramp?: Ramp) =>
    [
      [1, 1],
      [39, 1],
      [1, 39],
      [39, 39],
    ].forEach(([x, y]) => stamp(pattern, x, y, ramp));
  const middles = (pattern: Stamp, ramp?: Ramp) =>
    [
      [20, 1],
      [20, 39],
      [1, 20],
      [39, 20],
    ].forEach(([x, y]) => stamp(pattern, x, y, ramp));
  const studs = (pattern: Stamp, list: number[]) =>
    list.forEach((t) => {
      stamp(pattern, t, 2);
      stamp(pattern, t, 40);
      stamp(pattern, 2, t);
      stamp(pattern, 40, t);
    });
  const seam = (t: number, c: string) => {
    for (let r = 1; r <= 4; r++) both(t, r, c);
  };
  const carve = (pattern: string[], t0: number) =>
    pattern.forEach((row, ri) =>
      [...row].forEach((ch, ti) => {
        if (ch === "#") both(t0 + ti, ri + 1, P.o);
      }),
    );

  switch (rank) {
    case "peasant":
      for (let r = 1; r <= 4; r++) {
        put(r, r, P.s1);
        put(S - 1 - r, r, P.s1);
        put(r, S - 1 - r, P.s1);
        put(S - 1 - r, S - 1 - r, P.s1);
      }
      seam(14, P.o);
      for (const [r, a, b] of [
        [2, 8, 10],
        [3, 17, 19],
        [2, 25, 27],
        [3, 33, 35],
      ]) {
        for (let t = a; t <= b; t++) side(t, r, P.s1);
      }
      break;
    case "knight":
      seam(5, P.o);
      corners(KNIGHT_CORNER);
      studs(STUD, [13, 21, 29]);
      break;
    case "baron":
    case "count":
      for (let t = 1; t <= 42; t++) side(t, 2, P.s1);
      seam(5, P.o);
      corners(PLATE);
      if (rank === "count") {
        corners(GEM, RAMPS.blue);
        seam(19, P.o);
        middles(GEM, RAMPS.blue);
      }
      break;
    case "duke":
      corners(RING);
      carve(ARM, 6);
      middles(RING);
      break;
    case "emperor":
      carve(ARM, 6);
      corners(GEM, RAMPS.crimson);
      seam(19, P.o);
      middles(GEM, RAMPS.blue);
      studs(STUD, [14, 28]);
      break;
  }
  return col;
}
