import type { Pixels } from "./avatar";
import { artSet } from "./seasons";

// Ports of ped() and portrait() from design/prototypes/Reino.dc.html: stone pedestals with a
// gold/silver/bronze trim and the place number, and the King of the Season banner.

type Ramp = { o: string; s1: string; b: string; h?: string };
type Stone = { o: string; s1: string; b: string; h: string; hh: string };

const GOLD = { o: "#5A3A12", s1: "#C9962C", b: "#F2C14E", h: "#F7D57F" };
const SILVER = { o: "#3E4452", s1: "#8E96A4", b: "#C3C8D0", h: "#E4E8EE" };
const BRONZE = { o: "#3A2214", s1: "#8A5A34", b: "#B98050", h: "#D8A070" };

/** Per-season pedestal stone and banner cloth (season-lib.js `ped` and `banner`). */
const SEASON_STYLE: Record<number, { stone: Stone; banner: Ramp }> = {
  0: {
    stone: { o: "#1F1C27", s1: "#2C2936", b: "#3A3645", h: "#4E4A5A", hh: "#5E5A6C" },
    banner: { o: "#3A0A14", s1: "#6E1626", b: "#9A1F35", h: "#B3263B" },
  },
  1: {
    stone: { o: "#0C1E26", s1: "#163644", b: "#1F4E5E", h: "#1E7A80", hh: "#3AB4B0" },
    banner: { o: "#4A0E36", s1: "#B01E78", b: "#E0409A", h: "#F27AB8" },
  },
};

const style = (season: number) => SEASON_STYLE[artSet(season)] ?? SEASON_STYLE[0];

export type Place = 1 | 2 | 3;
export const PEDESTAL_WIDTH = 50;
export const PEDESTAL_HEIGHT: Record<Place, number> = { 1: 36, 2: 27, 3: 20 };
const TRIM: Record<Place, Ramp> = { 1: GOLD, 2: SILVER, 3: BRONZE };
const DIGITS: Record<Place, string[]> = {
  1: ["..##..", ".###..", "..##..", "..##..", "..##..", "..##..", "..##..", ".####."],
  2: [".####.", "##..##", "....##", "...##.", "..##..", ".##...", "##....", "######"],
  3: [".####.", "##..##", "....##", "..###.", "....##", "....##", "##..##", ".####."],
};

export function pedestalPixels(place: Place, season: number): Pixels {
  const W = PEDESTAL_WIDTH;
  const H = PEDESTAL_HEIGHT[place];
  const P = style(season).stone;
  const T = TRIM[place];
  const col: Pixels = new Array(W * H).fill(null);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c: string;
      if (x === 0 || x === W - 1 || y === 0 || y === H - 1) c = P.o;
      else if (y <= 2) c = x === 1 ? P.hh : P.h;
      else if (y === 3) c = P.o;
      else if (y === 4) c = T.b;
      else if (y === 5) c = T.s1;
      else if (x === 1) c = P.h;
      else if (x === W - 2 || y === H - 2) c = P.s1;
      else c = P.b;
      col[y * W + x] = c;
    }
  }
  for (let y = 14; y < H - 2; y += 6) for (let x = 2; x < W - 2; x++) col[y * W + x] = P.s1;
  for (let y = 8; y < H - 2; y++) {
    const row = Math.floor((y - 8) / 6);
    for (const x of [12 + (row % 2) * 12, 36 + (row % 2) * 6]) {
      if (y % 6 !== 2 && x < W - 2) col[y * W + x] = P.s1;
    }
  }
  const glyph = DIGITS[place];
  glyph.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch === "#" && 8 + y < H - 2) col[(8 + y) * W + 22 + x] = T.b;
    }),
  );
  glyph.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch !== "#") return;
      const X = 23 + x;
      const Y = 8 + y + 1;
      const inGlyph = (glyph[y + 1] ?? "")[x + 1] === "#";
      if (!inGlyph && Y < H - 2 && col[Y * W + X] !== T.b) col[Y * W + X] = P.o;
    }),
  );
  return col;
}

export const BANNER_WIDTH = 60;
export const BANNER_HEIGHT = 70;
/** Where the 44×44 portrait sits on the banner. */
export const BANNER_PORTRAIT = { x: 8, y: 7 };

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Fills a mask with a 1 px outline and corner shading, as the prototype's drawM(). */
function drawMask(col: Pixels, W: number, H: number, mask: Uint8Array, P: Ramp) {
  const inMask = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x] && N4.some(([a, b]) => inMask(x + a, y + b))) col[y * W + x] = P.o;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      const tl = !inMask(x - 1, y) || !inMask(x, y - 1);
      const br = !inMask(x + 1, y) || !inMask(x, y + 1);
      col[y * W + x] = br && !tl ? P.s1 : tl && !br && P.h ? P.h : P.b;
    }
  }
}

/**
 * The banner with a 44×44 portrait on it. With `clearWindow`, the portrait's empty cells stay
 * transparent so an uploaded image can show through.
 */
export function bannerPixels(portrait: Pixels, season: number, clearWindow = false): Pixels {
  const W = BANNER_WIDTH;
  const H = BANNER_HEIGHT;
  const col: Pixels = new Array(W * H).fill(null);
  const cloth = style(season).banner;
  const banner = new Uint8Array(W * H);
  for (let y = 4; y < H; y++) {
    for (let x = 5; x <= 54; x++) {
      if (y >= 58 && Math.abs(x - 29.5) < (y - 57) * 2.3) continue;
      banner[y * W + x] = 1;
    }
  }
  drawMask(col, W, H, banner, cloth);
  for (let y = 5; y < 57; y++) {
    col[y * W + 17] = cloth.s1;
    col[y * W + 42] = cloth.s1;
  }
  const rod = new Uint8Array(W * H);
  for (let y = 1; y <= 2; y++) for (let x = 1; x <= 58; x++) rod[y * W + x] = 1;
  drawMask(col, W, H, rod, GOLD);
  for (const ox of [0, 57]) {
    for (let y = 0; y <= 3; y++) {
      for (let x = 0; x <= 2; x++) col[y * W + ox + x] = y === 0 || y === 3 || x === 0 || x === 2 ? GOLD.o : GOLD.b;
    }
  }
  for (let x = 6; x <= 53; x++) {
    col[53 * W + x] = GOLD.b;
    col[54 * W + x] = GOLD.s1;
  }
  for (let y = 0; y < 44; y++) {
    for (let x = 0; x < 44; x++) {
      const c = portrait[y * 44 + x];
      const i = (y + BANNER_PORTRAIT.y) * W + x + BANNER_PORTRAIT.x;
      if (c) col[i] = c;
      else if (clearWindow && x >= 6 && x < 38 && y >= 6 && y < 38) col[i] = null;
    }
  }
  return col;
}
