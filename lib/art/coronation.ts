import { renderAvatar } from "@/design/lib/avatar-lib.js";
import type { Rank } from "@/lib/game/rank";
import { type AvatarSource, avatarPixels, avatarTraits } from "./avatar";
import { framePixels } from "./frames";
import { portraitOrigin, seasonScene } from "./scenes";

// Port of the coronation in design/prototypes/Coronacion.dc.html (MOTION §1). The crown leaves the
// old king, arcs over and lands on the new one; everything moves on the scene's pixel grid.

export const CORONATION_MS = { full: 1800, reduced: 400 } as const;
export const LANDING_MS = { full: 1300, reduced: 200 } as const;

type RGB = [number, number, number];
type Sprite = [number, number, RGB][];
export type Monarch = { avatar: AvatarSource; rank: Rank };

const rgb = (c: string): RGB => {
  const n = parseInt(c.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

function sprite(pixels: (string | null)[], width: number, ox = 0, oy = 0, swap?: Record<string, string>): Sprite {
  const out: Sprite = [];
  pixels.forEach((c, i) => {
    if (c) out.push([(i % width) - ox, Math.floor(i / width) - oy, rgb(swap?.[c.toUpperCase()] ?? c)]);
  });
  return out;
}

const CONFETTI = ["#F2C14E", "#F7D57F", "#B3263B", "#F3EDE2", "#4A90E2", "#C9962C"].map(rgb);
const TRAIL: [number, RGB][] = [
  [60, [247, 213, 127]],
  [120, [201, 150, 44]],
];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const FLASH: Record<string, string> = { "#F2C14E": "#F7D57F", "#C9962C": "#F2C14E", "#5A3A12": "#C9962C" };

const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const easeIn = (u: number) => u * u;
const easeInOut = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Motion per stage size, from the prototype (98×72 mobile, 240×84 desktop). */
const MOTION = {
  mobile: { designWidth: 98, oldEnd: -14, lift: 6, apex: 9, n: 24, vx: 45, vy0: 30, vy1: 50, g: 240, seed: 7 },
  desktop: { designWidth: 240, oldEnd: 14, lift: 6, apex: 22, n: 34, vx: 70, vy0: 40, vy1: 70, g: 300, seed: 11 },
} as const;

export type Stage = ReturnType<typeof coronationStage>;

/**
 * Everything the animation needs for one scene size. Our scenes are wider than the design's and
 * centered, so the prototype's x positions are shifted by the extra margin.
 */
export function coronationStage(
  season: number,
  size: "mobile" | "desktop",
  width: number,
  height: number,
  from: Monarch | null,
  to: Monarch,
) {
  const m = MOTION[size];
  const margin = (width - m.designWidth) / 2;
  const P0 = portraitOrigin(width, height);
  const base = seasonScene(season, width, height, { bare: true });
  const baseData = new Uint8ClampedArray(width * height * 4);
  base.forEach((c, i) => {
    if (c) baseData.set([...rgb(c), 255], i * 4);
  });

  // The crown that flies is the old king's (the new king has none yet). From an empty throne it
  // rises from the cushion.
  const wearer = from ?? to;
  const crownLayer = renderAvatar(avatarTraits(wearer.avatar), { season, layer: "crown" });
  let x0 = 99;
  let y0 = 99;
  let x1 = -1;
  let y1 = -1;
  crownLayer.forEach((c, i) => {
    if (!c) return;
    const x = i % 32;
    const y = Math.floor(i / 32);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  });
  const crown = sprite(crownLayer, 32, x0, y0);
  const crownFlash = sprite(crownLayer, 32, x0, y0, FLASH);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  // Crown offset inside the portrait: avatar at (6, 6) in the frame.
  const cOff = { x: 6 + x0, y: 6 + y0 };

  let seed: number = m.seed;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const parts = Array.from({ length: m.n }, (_, i) => ({
    vx: (rnd() * 2 - 1) * m.vx,
    vy: -(m.vy0 + rnd() * m.vy1),
    life: 0.3 + rnd() * 0.2,
    col: CONFETTI[i % CONFETTI.length],
    ph: Math.floor(rnd() * 4),
  }));

  const portrait = (who: Monarch) =>
    sprite(framePixels(who.rank, avatarPixels(who.avatar, { season, crown: false })), 44);

  return {
    width,
    height,
    P0,
    baseData,
    parts,
    g: m.g,
    lift: m.lift,
    apex: m.apex,
    oldEnd: m.oldEnd + margin,
    newStart: m.designWidth + margin,
    fromEmpty: from === null,
    oldSprite: from ? portrait(from) : [],
    newSprite: portrait(to),
    crown,
    crownFlash,
    cw,
    ch,
    cOff,
  };
}

function crownPosition(st: Stage, t: number): [number, number] {
  const { P0, cOff } = st;
  const endX = P0.x + cOff.x;
  const baseY = P0.y + cOff.y;
  // From an empty throne the crown starts on the cushion, where the scene draws it.
  const startX = st.fromEmpty ? endX : Math.round(P0.x + (st.oldEnd - P0.x) * easeOut(clamp(t / 350))) + cOff.x;
  const startY = st.fromEmpty ? P0.y + 39 : baseY;
  const liftX = st.fromEmpty ? endX : st.oldEnd + cOff.x;
  if (t < 350) return [startX, startY];
  if (t < 500) return [liftX, startY - Math.round(st.lift * easeOut((t - 350) / 150))];
  if (t < 1150) {
    const u = easeInOut((t - 500) / 650);
    const y = startY + (baseY - startY) * u;
    return [Math.round(liftX + (endX - liftX) * u), Math.round(y - st.lift - st.apex * 4 * u * (1 - u))];
  }
  if (t < 1260) return [endX, Math.round(baseY - st.lift + (st.lift + 1) * easeIn((t - 1150) / 110))];
  if (t < 1300) return [endX, baseY + 1];
  return [endX, baseY];
}

/** Draws frame `t` (ms) of the full animation into `image`. */
export function drawCoronation(st: Stage, image: ImageData, t: number): void {
  const { width: W, height: H, P0 } = st;
  const d = image.data;
  d.set(st.baseData);
  const put = (x: number, y: number, v: RGB) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = v[0];
    d[i + 1] = v[1];
    d[i + 2] = v[2];
    d[i + 3] = 255;
  };

  const u = easeOut(clamp(t / 350));
  const oldX = Math.round(P0.x + (st.oldEnd - P0.x) * u);
  const newX = Math.round(st.newStart + (P0.x - st.newStart) * u);
  const fade = clamp((t - 1300) / 500);
  if (fade < 1) {
    for (const [dx, dy, v] of st.oldSprite) {
      const x = oldX + dx;
      const y = P0.y + dy;
      if (fade > 0 && (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < fade) continue;
      put(x, y, v);
    }
  }
  for (const [dx, dy, v] of st.newSprite) put(newX + dx, P0.y + dy, v);

  if (t > 560 && t < 1270) {
    for (const [lag, v] of TRAIL) {
      const tt = t - lag;
      if (tt < 500) continue;
      const [x, y] = crownPosition(st, tt);
      put(x + (st.cw >> 1), y + (st.ch >> 1), v);
    }
  }

  const [cx, cy] = crownPosition(st, t);
  for (const [dx, dy, v] of t >= 1300 && t < 1380 ? st.crownFlash : st.crown) put(cx + dx, cy + dy, v);

  const tau = (t - 1300) / 1000;
  if (tau >= 0 && tau <= 0.22) {
    const rOut = 3 + Math.round(Math.min(tau / 0.1, 1) * 9);
    const rIn = 3 + Math.round(Math.max(0, (tau - 0.08) / 0.14) * 9);
    const mx = cx + (st.cw >> 1);
    const my = cy + (st.ch >> 1);
    const left = cx - 1;
    const right = cx + st.cw;
    const top = cy - 1;
    // Up and to the sides, never toward the face.
    const rays: ((r: number) => [number, number])[] = [
      (r) => [left - r, my],
      (r) => [right + r, my],
      (r) => [left - r, top - r],
      (r) => [right + r, top - r],
      (r) => [mx - 1, top - r],
      (r) => [mx, top - r],
    ];
    for (const ray of rays) {
      for (let r = rIn - 2; r <= rOut - 2; r++) {
        const [x, y] = ray(r);
        put(x, y, r < (rIn + rOut) / 2 - 2 ? [247, 213, 127] : [242, 193, 78]);
      }
    }
  }

  if (tau >= 0 && tau <= 0.5) {
    const ox = cx + (st.cw >> 1);
    const oy = cy;
    for (const p of st.parts) {
      if (tau > p.life) continue;
      const x = Math.round(ox + p.vx * tau);
      const y = Math.round(oy + p.vy * tau + 0.5 * st.g * tau * tau);
      if (y > H - 6) continue;
      const flutter = (Math.floor(tau * 14) + p.ph) % 3;
      put(x, y, p.col);
      if (flutter === 0) put(x + 1, y, p.col);
      else if (flutter === 1) put(x, y + 1, p.col);
    }
  }
}

/** Still frames for the reduced-motion crossfade: before (old king crowned) and after. */
export function coronationStills(st: Stage): { before: ImageData; after: ImageData } {
  const make = (portrait: Sprite, withCrown: boolean) => {
    const image = new ImageData(st.width, st.height);
    image.data.set(st.baseData);
    const put = (x: number, y: number, v: RGB) => {
      if (x < 0 || y < 0 || x >= st.width || y >= st.height) return;
      image.data.set([...v, 255], (y * st.width + x) * 4);
    };
    for (const [dx, dy, v] of portrait) put(st.P0.x + dx, st.P0.y + dy, v);
    if (withCrown) for (const [dx, dy, v] of st.crown) put(st.P0.x + st.cOff.x + dx, st.P0.y + st.cOff.y + dy, v);
    return image;
  };
  return { before: make(st.oldSprite, !st.fromEmpty), after: make(st.newSprite, true) };
}
