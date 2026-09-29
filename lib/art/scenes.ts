import type { Pixels } from "./avatar";

// Ports of sceneT0 (design/prototypes/throne-lib.js) and scene1 (design/prototypes/season-lib.js).
// Pure functions (W, H, options) → pixels; the scene grows sideways with W and never stretches.
// Tests compare the output with the exported SVGs in design/assets/scenes.

export type SceneOptions = {
  /** 44×44 portrait drawn into the backrest; an all-null frame leaves the bare wooden seat. */
  frame?: Pixels;
  /** Cushion without the crown. */
  bare?: boolean;
  /** Darkened hall with a spotlight on the throne (empty throne state). */
  spot?: boolean;
};

type Ramp = { o: string; s1: string; b: string; h?: string };
type Mask = Uint8Array;
type Layer = { m: Mask; p: Ramp; ol?: boolean; tone?: keyof Ramp };

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const rgb = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

const mix = (a: string, b: string, t: number) => {
  const A = rgb(a);
  const B = rgb(b);
  return (
    "#" +
    A.map((v, i) =>
      Math.round(v + (B[i] - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
      .join("")
      .toUpperCase()
  );
};

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h ^ (h >>> 16);
};

/** Shared drawing helpers over a W×H pixel buffer. */
function canvas(W: number, H: number) {
  const N = W * H;
  const col: Pixels = new Array(N).fill(null);
  const mask = (): Mask => new Uint8Array(N);
  const rect = (m: Mask, x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) m[y * W + x] = 1;
    return m;
  };
  const pat = (m: Mask, rows: string[], ox: number, oy: number) => {
    rows.forEach((r, y) =>
      [...r].forEach((ch, x) => {
        const X = ox + x;
        const Y = oy + y;
        if (ch === "#" && X >= 0 && Y >= 0 && X < W && Y < H) m[Y * W + X] = 1;
      }),
    );
    return m;
  };
  const paint = (layers: Layer[]) =>
    layers.forEach((L) => {
      const { m, p: P } = L;
      const inM = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1;
      if (L.ol) {
        const outline: number[] = [];
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++)
            if (!m[y * W + x] && N4.some(([a, b]) => inM(x + a, y + b))) outline.push(y * W + x);
        outline.forEach((i) => (col[i] = P.o));
      }
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (!m[y * W + x]) continue;
          if (L.tone) {
            col[y * W + x] = P[L.tone] ?? null;
            continue;
          }
          const tl = !inM(x - 1, y) || !inM(x, y - 1);
          const br = !inM(x + 1, y) || !inM(x, y + 1);
          col[y * W + x] = br && !tl ? P.s1 : P.b;
        }
    });
  /** Outline + shading, or a flat tone when given. */
  const draw = (m: Mask, P: Ramp, tone?: keyof Ramp) => paint([tone ? { m, p: P, tone } : { m, p: P, ol: true }]);
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < W && y < H) col[y * W + x] = c;
  };
  return { col, mask, rect, pat, paint, draw, put };
}

// ---------------------------------------------------------------------------
// Season 0 · Genesis
// ---------------------------------------------------------------------------

export function sceneT0(W: number, H: number, opt: SceneOptions = {}): Pixels {
  const { col, mask: M, rect, pat, draw } = canvas(W, H);
  const cx = W / 2;
  const ST = { o: "#1F1C27", s1: "#2C2936", b: "#3A3645" };
  const PL = { o: "#1F1C27", s1: "#3A3645", b: "#4E4A5A" };
  const FLR = { o: "#17141E", b: "#262330" };
  const CR = { o: "#3E0C18", s1: "#861B2F", b: "#B3263B" };
  const GD = { o: "#5A3A12", s1: "#C9962C", b: "#F2C14E" };
  const WD = { o: "#2A160C", s1: "#4E2E1A", b: "#6E4428" };
  const wallB = H - 10;

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c: string;
      if (y < wallB - 2) {
        const row = y >> 2;
        const rx = x - cx + 1024 + (row % 2 ? 4 : 0);
        const bx = rx % 8;
        const bi = Math.floor(rx / 8);
        if (y % 4 === 3 || bx === 7) c = ST.o;
        else c = hash(bi, row) % 6 === 0 ? ST.s1 : y % 4 === 2 ? ST.s1 : ST.b;
      } else if (y === wallB - 2) c = PL.b;
      else if (y === wallB - 1) c = PL.s1;
      else if (y === wallB) c = FLR.o;
      else {
        const fy = y - wallB - 1;
        const rx = x - cx + 1024 + (fy >= 4 ? 6 : 0);
        c = fy === 4 || rx % 12 === 11 ? FLR.o : FLR.b;
      }
      col[y * W + x] = c;
    }

  [cx - 66, cx + 66, cx - 114, cx + 114]
    .filter((p) => p > -6 && p < W + 6)
    .forEach((pc) => {
      const m = M();
      rect(m, pc - 4, 3, pc + 3, wallB - 4);
      rect(m, pc - 6, 0, pc + 5, 2);
      rect(m, pc - 6, wallB - 3, pc + 5, wallB - 1);
      draw(m, PL);
      const f = M();
      rect(f, pc - 1, 5, pc - 1, wallB - 6);
      rect(f, pc + 2, 5, pc + 2, wallB - 6);
      draw(f, PL, "s1");
    });

  [cx - 42, cx + 42].concat(W >= 200 ? [cx - 90, cx + 90] : []).forEach((bc) => {
    const by = 4;
    const m = M();
    rect(m, bc - 5, by + 2, bc + 4, by + 33);
    for (let k = 0; k < 4; k++)
      for (let x = bc - 5; x <= bc + 4; x++) if (Math.abs(x - (bc - 0.5)) < k + 1) m[(by + 30 + k) * W + x] = 0;
    draw(m, CR);
    draw(rect(M(), bc + 2, by + 13, bc + 2, by + 25), CR, "s1");
    draw(rect(rect(M(), bc - 4, by + 5, bc + 3, by + 5), bc - 4, by + 27, bc + 3, by + 27), GD, "s1");
    draw(pat(M(), ["#.##.#", "######", "######"], bc - 3, by + 10), GD);
    draw(rect(M(), bc - 7, by, bc + 6, by + 1), GD);
  });

  draw(rect(M(), cx - 38, H - 4, cx + 37, H - 1), PL);
  draw(rect(M(), cx - 10, H - 4, cx + 9, H - 1), CR);
  const before = col.slice();

  const x0 = cx - 32;
  const y0 = H - 68;
  const T = (a: number, b: number, c: number, d: number, m?: Mask) => rect(m ?? M(), x0 + a, y0 + b, x0 + c, y0 + d);
  draw(T(6, 4, 57, 51), WD);
  draw(T(59, 44, 62, 59, T(1, 44, 4, 59)), WD);
  draw(T(54, 38, 63, 43, T(0, 38, 9, 43)), WD);
  draw(T(60, 36, 63, 39, T(0, 36, 3, 39)), GD);
  draw(T(4, 52, 59, 56), CR);
  draw(T(4, 57, 59, 59), WD);
  draw(T(6, 58, 57, 58), GD, "s1");
  draw(T(54, 60, 59, 63, T(4, 60, 9, 63)), WD);
  const fin = ["..##..", ".####.", "######", "######", ".####.", "..##.."];
  draw(pat(pat(M(), fin, x0 + 4, y0), fin, x0 + 54, y0), GD);
  const crest = T(14, 2, 49, 5);
  T(31, 0, 32, 1, crest);
  T(22, 0, 23, 1, crest);
  T(40, 0, 41, 1, crest);
  draw(crest, GD);
  draw(T(31, 3, 32, 4), CR, "b");

  if (opt.frame) {
    for (let fy = 0; fy < 44; fy++)
      for (let fx = 0; fx < 44; fx++) {
        const c = opt.frame[fy * 44 + fx];
        if (c) col[(y0 + 6 + fy) * W + x0 + 10 + fx] = c;
      }
  } else {
    draw(T(11, 7, 52, 49), CR);
    const tuft = M();
    for (let ty = 13; ty <= 43; ty += 10) for (let tx = 17; tx <= 47; tx += 10) T(tx, ty, tx + 1, ty + 1, tuft);
    draw(tuft, CR, "o");
    draw(T(14, 10, 14, 46), CR, "s1");
    if (!opt.bare) {
      draw(
        pat(
          M(),
          [
            "#......##......#",
            "##....####....##",
            "##...######...##",
            "###.########.###",
            "################",
            "################",
            "################",
          ],
          x0 + 24,
          y0 + 45,
        ),
        GD,
      );
      draw(T(31, 49, 32, 50), CR, "b");
    }
  }

  if (opt.spot) {
    const dark: Record<string, string> = {};
    const palette = [...new Set(col.filter((c): c is string => c !== null))];
    const nearest = (target: string) => {
      const T = rgb(target);
      let best = palette[0];
      let bestDistance = 1e9;
      palette.forEach((p) => {
        const Q = rgb(p);
        const d = 0.3 * (Q[0] - T[0]) ** 2 + 0.59 * (Q[1] - T[1]) ** 2 + 0.11 * (Q[2] - T[2]) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = p;
        }
      });
      return best;
    };
    const darken = (c: string) => dark[c] ?? (dark[c] = nearest(mix(c, "#0B0910", 0.62)));
    for (let y = 0; y < H; y++) {
      const hw = 8 + (y * 28) / H;
      for (let x = 0; x < W; x++) {
        const d = Math.abs(x + 0.5 - cx) - hw;
        const i = y * W + x;
        const c = col[i];
        if (c !== before[i] || c === null) continue;
        if (d > 2 || (d > 0 && (x + y) % 2 === 0)) col[i] = darken(c);
      }
    }
  }
  return col;
}

// ---------------------------------------------------------------------------
// Season 1 · Day of the Dead
// ---------------------------------------------------------------------------

const CORE = {
  gold: { o: "#5A3A12", s1: "#C9962C", b: "#F2C14E", h: "#F7D57F" },
  ivory: { o: "#4E4034", s1: "#BFB29C", b: "#F3EDE2" },
};
const NO = { o: "#1A1226", s1: "#261A36", b: "#33234A" };
const SU = "#231A2C";
const BA = { o: "#2A1614", s1: "#4A2620", b: "#7A4A38" };
const CE = { o: "#6A2A08", s1: "#D9661A", b: "#F28C28", h: "#FFC24A" };
const RO = { o: "#4A0E36", s1: "#B01E78", b: "#E0409A", h: "#F27AB8" };
const TU = { o: "#0E3A40", s1: "#1E7A80", b: "#3AB4B0" };
const LI = { o: "#1E4014", s1: "#3E8A2A", b: "#6CC04A" };
const VI = { o: "#2A1650", s1: "#5A36A0", b: "#8A62D8" };
const MA = { o: "#0C1E26", s1: "#163644", b: "#1F4E5E" };

const CROWN1 = [".o.....", ".C...kk", ".CC.kkk", ".CCCkek", "CCCCkkn", "BBBBBkt", "BmBBgBB", "BBBBBBB"];

/** Mirrored glyph rows → one mask per glyph character. */
function glyphMasks(W: number, H: number, rows: string[], ox: number, oy: number): Record<string, Mask> {
  const out: Record<string, Mask> = {};
  rows.forEach((r, y) => {
    const s = r + [...r].reverse().join("");
    [...s].forEach((ch, x) => {
      if (ch === ".") return;
      const X = ox + x;
      const Y = oy + y;
      if (X < 0 || Y < 0 || X >= W || Y >= H) return;
      (out[ch] ??= new Uint8Array(W * H))[Y * W + X] = 1;
    });
  });
  return out;
}

function union(W: number, H: number, glyphs: Record<string, Mask>, chars: string): Mask {
  const m = new Uint8Array(W * H);
  [...chars].forEach((c) =>
    glyphs[c]?.forEach((v, i) => {
      if (v) m[i] = 1;
    }),
  );
  return m;
}

function sugarSkullCrown(W: number, H: number, ox: number, oy: number): Layer[] {
  const g = glyphMasks(W, H, CROWN1, ox, oy);
  return [
    { m: union(W, H, g, "oCBmg"), p: CORE.gold, ol: true },
    { m: union(W, H, g, "kent"), p: CORE.ivory, ol: true },
    { m: union(W, H, g, "en"), p: CORE.ivory, tone: "o" },
    { m: union(W, H, g, "t"), p: CORE.ivory, tone: "s1" },
    { m: union(W, H, g, "og"), p: CE, tone: "b" },
    { m: union(W, H, g, "m"), p: RO, tone: "b" },
  ];
}

export function sceneT1(W: number, H: number, opt: SceneOptions = {}): Pixels {
  const { col, mask: M, rect, pat, paint, draw, put } = canvas(W, H);
  const cx = W / 2;
  const wallB = H - 10;

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c: string;
      const rx = x - cx + 1024;
      if (y < wallB - 5) c = hash(rx, y) % 11 === 0 ? NO.s1 : NO.b;
      else if (y === wallB - 5) c = RO.s1;
      else if (y < wallB) {
        const tx = rx % 10;
        c =
          tx === 9
            ? BA.o
            : y === wallB - 1
              ? BA.s1
              : (tx === 4 || tx === 5) && (y === wallB - 3 || y === wallB - 2) && Math.floor(rx / 10) % 2 === 0
                ? TU.s1
                : BA.b;
      } else if (y === wallB) c = NO.o;
      else {
        const fy = y - wallB - 1;
        const r2 = rx + (fy >= 4 ? 6 : 0);
        c = fy === 4 || r2 % 12 === 11 ? NO.o : SU;
      }
      col[y * W + x] = c;
    }

  // Papel picado: two cords with cut-paper flags.
  const FLAG = ["########", "########", "##.##.##", "#.#..#.#", "##.##.##", "########", ".#.##.#."];
  const RAMPS = [RO, CE, TU, LI, VI];
  const cord = (top: number, sag: number, span: number, phase: number, ci: number) => {
    const yAt = (x: number) => {
      const u = ((((x - cx - phase) % span) + span) % span) / span;
      return top + Math.round(sag * 4 * u * (1 - u));
    };
    for (let x = 0; x < W; x++) put(x, yAt(x), NO.o);
    const first = Math.floor((0 - cx - phase) / span) - 1;
    const last = Math.ceil((W - cx - phase) / span) + 1;
    for (let s = first; s <= last; s++)
      for (let k = 0; k < 3; k++) {
        const fx = Math.round(cx + phase + s * span + 3 + k * Math.floor((span - 6) / 3));
        const fy = yAt(fx + 4) + 1;
        const idx = ((((s * 3 + k + ci) % 5) + 5) % 5) as 0 | 1 | 2 | 3 | 4;
        draw(pat(M(), FLAG, fx, fy), RAMPS[idx]);
      }
  };
  cord(1, 5, 40, 20, 0);
  cord(13, 6, 48, 0, 2);

  // Marigold garlands.
  const FLOWER = [".##.", "####", "####", ".##."];
  const flowers = (list: [number, number][], P: Ramp) => {
    const m = M();
    list.forEach(([x, y]) => pat(m, FLOWER, x, y));
    draw(m, P);
    list.forEach(([x, y]) => put(x + 1, y + 1, P.h ?? P.b));
  };
  [cx - 54, cx + 54, cx - 98, cx + 98]
    .filter((gc) => gc - 3 >= 0 && gc + 2 < W)
    .forEach((gc) => {
      const bottom = Math.min(wallB - 14, Math.round(H * 0.62));
      const pts: [number, number][] = [];
      for (let y = 2; y <= bottom; y += 5) pts.push([Math.round(gc - 2), y]);
      flowers(
        pts.filter((_, i) => i % 4 !== 3),
        CE,
      );
      flowers(
        pts.filter((_, i) => i % 4 === 3),
        RO,
      );
      draw(pat(M(), [".##.", ".##.", "####", "#..#"], Math.round(gc - 2), bottom + 5), RO);
    });

  // Candles.
  const candle = (x: number, h: number) => {
    const top = wallB + 2 - h;
    draw(rect(M(), x, top, x + 2, wallB + 2), CORE.ivory);
    draw(rect(M(), x + 1, top - 3, x + 1, top - 2), CE);
    put(x + 1, top - 3, CE.h);
  };
  [cx - 66, cx + 66, cx - 114, cx + 114]
    .filter((p) => p > -6 && p < W + 6)
    .forEach((pc) => {
      candle(pc - 5, 9);
      candle(pc - 1, 13);
      candle(pc + 3, 7);
    });

  // Marigold arch behind the throne.
  const arch: [number, number][] = [];
  const ccx = cx - 2;
  const ccy = H - 6;
  const rx = 39;
  const ry = H - 10;
  let last: [number, number] | null = null;
  for (let a = 0; a <= Math.PI + 1e-6; a += 0.004) {
    const x = Math.round(ccx + rx * Math.cos(a));
    const y = Math.round(ccy - ry * Math.sin(a));
    if (!last || Math.hypot(x - last[0], y - last[1]) >= 5) {
      arch.push([x, y]);
      last = [x, y];
    }
  }
  flowers(
    arch.filter((_, i) => i % 3 !== 2),
    CE,
  );
  flowers(
    arch.filter((_, i) => i % 3 === 2),
    RO,
  );

  // Clay step and petal path.
  draw(rect(M(), cx - 38, H - 4, cx + 37, H - 1), BA);
  draw(rect(M(), cx - 10, H - 4, cx + 9, H - 1), CE);
  for (let y = H - 3; y <= H - 2; y++) for (let x = cx - 9; x <= cx + 8; x++) if (hash(x, y) % 4 === 0) put(x, y, CE.h);

  // Painted throne with flowers and a sugar skull crest.
  const pre = col.slice();
  const x0 = cx - 32;
  const y0 = H - 68;
  const T = (a: number, b: number, c: number, d: number, m?: Mask) => rect(m ?? M(), x0 + a, y0 + b, x0 + c, y0 + d);
  draw(T(14, 1, 49, 5), MA);
  draw(T(6, 4, 57, 51), MA);
  for (let y = 8; y <= 48; y += 5) {
    put(x0 + 8, y0 + y, TU.b);
    put(x0 + 55, y0 + y, TU.b);
  }
  draw(T(59, 44, 62, 59, T(1, 44, 4, 59)), MA);
  draw(T(54, 38, 63, 43, T(0, 38, 9, 43)), MA);
  flowers(
    [
      [x0 + 0, y0 + 35],
      [x0 + 60, y0 + 35],
    ],
    CE,
  );
  draw(T(4, 52, 59, 56), RO);
  draw(T(4, 57, 59, 59), MA);
  draw(T(6, 58, 57, 58), CE, "b");
  for (let x = 10; x <= 54; x += 6) put(x0 + x, y0 + 58, RO.b);
  draw(T(54, 60, 59, 63, T(4, 60, 9, 63)), MA);
  flowers(
    [
      [x0 + 3, y0 + 0],
      [x0 + 57, y0 + 0],
      [x0 + 12, y0 + 1],
      [x0 + 48, y0 + 1],
    ],
    CE,
  );
  const SKULL = [
    "...######...",
    ".##########.",
    "############",
    "##..####..##",
    "##..####..##",
    "#####..#####",
    ".##########.",
    "..#.#..#.#..",
    "...######...",
  ];
  draw(pat(M(), SKULL, x0 + 26, y0 - 4), CORE.ivory);
  put(x0 + 31, y0 - 3, CE.b);
  put(x0 + 32, y0 - 3, CE.b);
  put(x0 + 31, y0 - 2, CE.h);
  put(x0 + 32, y0 - 2, CE.s1);
  put(x0 + 27, y0 + 1, RO.b);
  put(x0 + 36, y0 + 1, RO.b);

  if (opt.frame) {
    for (let fy = 0; fy < 44; fy++)
      for (let fx = 0; fx < 44; fx++) {
        const c = opt.frame[fy * 44 + fx];
        if (c) put(x0 + 10 + fx, y0 + 6 + fy, c);
      }
  } else {
    draw(T(11, 7, 52, 49), RO);
    const tuft = M();
    for (let ty = 13; ty <= 43; ty += 10) for (let tx = 17; tx <= 47; tx += 10) T(tx, ty, tx + 1, ty + 1, tuft);
    draw(tuft, RO, "o");
    draw(T(14, 10, 14, 46), RO, "s1");
    if (!opt.bare) paint(sugarSkullCrown(W, H, x0 + 25, y0 + 43));
  }

  if (opt.spot) {
    const DK: Record<string, string> = {};
    [NO, BA, CE, RO, TU, LI, VI, MA, CORE.ivory, CORE.gold].forEach((P: Ramp) => {
      if (P.h) DK[P.h] = P.b;
      DK[P.b] = P.s1;
      DK[P.s1] = P.o;
      DK[P.o] = NO.o;
    });
    DK[SU] = NO.o;
    DK[NO.o] = NO.o;
    for (let y = 0; y < H; y++) {
      const hw = 8 + (y * 28) / H;
      for (let x = 0; x < W; x++) {
        const d = Math.abs(x + 0.5 - cx) - hw;
        const i = y * W + x;
        const c = col[i];
        if (c === null || (c !== pre[i] && d < 30)) continue;
        if (d > 2 || (d > 0 && (x + y) % 2 === 0)) col[i] = DK[c] ?? c;
      }
    }
  }
  return col;
}

/** Scene of a season; seasons without their own scene use Genesis (T2 art is announcement-only). */
export function seasonScene(season: number, W: number, H: number, opt: SceneOptions = {}): Pixels {
  return season === 1 ? sceneT1(W, H, opt) : sceneT0(W, H, opt);
}

/** Top-left corner of the 44×44 portrait inside a W×H scene. */
export function portraitOrigin(W: number, H: number): { x: number; y: number } {
  return { x: W / 2 - 22, y: H - 62 };
}
