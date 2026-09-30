import "server-only";
import { FLAGS, countryPill } from "@/design/lib/country-pill.js";
import { AVATAR_SIZE, type AvatarSource, type Pixels, crownPixels } from "@/lib/art/avatar";
import { FRAME_SIZE } from "@/lib/art/frames";
import { portraitPixels } from "@/lib/art/portrait";
import { portraitOrigin, seasonScene } from "@/lib/art/scenes";
import { MEDAL_KEY, type AchievementCode } from "@/lib/game/achievements";
import type { Rank } from "@/lib/game/rank";
import { designAsset, svgPixels } from "./raster";

// Share card and email art, ported from design/prototypes/Compartir y Correo.dc.html.

/** The design's "Surprised" expression, for the dethroned king. */
const SURPRISED = 3;

export type SceneMood = "victory" | "challenge" | "dethroned";

type Canvas = { px: Pixels; W: number; H: number };

function set({ px, W, H }: Canvas, x: number, y: number, color: string) {
  if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = color;
}

/** Points in `color` with a 1 px outline around the shape. */
function outlined(canvas: Canvas, points: [number, number][], color: string, outline: string) {
  const inside = new Set(points.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of points) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (!inside.has(`${x + dx},${y + dy}`)) set(canvas, x + dx, y + dy, outline);
    }
  }
  for (const [x, y] of points) set(canvas, x, y, color);
}

/** Victory: six gold and ivory sparkles around the portrait. */
function sparkles(canvas: Canvas) {
  const P = portraitOrigin(canvas.W, canvas.H);
  const stars: [number, number, string][] = [
    [-10, 2, "#F7D57F"],
    [53, 6, "#F3EDE2"],
    [-14, 22, "#F3EDE2"],
    [57, 26, "#F7D57F"],
    [-5, -9, "#F2C14E"],
    [49, -6, "#F2C14E"],
  ];
  for (const [dx, dy, color] of stars) {
    const x = P.x + dx;
    const y = P.y + dy;
    outlined(
      canvas,
      [
        [x, y],
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ],
      color,
      "#5A3A12",
    );
  }
}

/** Challenge: a target reticle around the portrait. */
function reticle(canvas: Canvas) {
  const P = portraitOrigin(canvas.W, canvas.H);
  const x0 = P.x - 4;
  const y0 = P.y - 4;
  const x1 = P.x + 47;
  const y1 = P.y + 47;
  const points: [number, number][] = [];
  for (let i = 0; i < 7; i++) {
    points.push([x0 + i, y0], [x0, y0 + i], [x1 - i, y0], [x1, y0 + i], [x0 + i, y1], [x0, y1 - i], [x1 - i, y1], [x1, y1 - i]);
  }
  const mx = P.x + 21;
  const my = P.y + 21;
  for (let i = 0; i < 4; i++) {
    points.push([mx, y0 - 3 + i], [mx + 1, y0 - 3 + i], [mx, y1 + i], [mx + 1, y1 + i], [x0 - 3 + i, my], [x0 - 3 + i, my + 1], [x1 + i, my], [x1 + i, my + 1]);
  }
  outlined(canvas, points, "#F3EDE2", "#14111C");
}

/** Dethroned: the crown lies upside down on the floor, centred under the throne. */
function fallenCrown(canvas: Canvas, avatar: AvatarSource, season: number) {
  const crown = crownPixels(avatar, season);
  let x0 = AVATAR_SIZE;
  let y0 = AVATAR_SIZE;
  let x1 = -1;
  let y1 = -1;
  crown.forEach((c, i) => {
    if (!c) return;
    const x = i % AVATAR_SIZE;
    const y = Math.floor(i / AVATAR_SIZE);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  });
  if (x1 < 0) return;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const ox = Math.round(canvas.W / 2 - cw / 2);
  const oy = canvas.H - 1 - ch;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const c = crown[(y0 + (ch - 1 - y)) * AVATAR_SIZE + x0 + x];
      if (c) set(canvas, ox + x, oy + y, c);
    }
  }
}

/**
 * The season's throne room with the player's portrait on the seat: crowned and sparkling for a
 * victory, crowned under a reticle for a challenge, surprised and crownless for a dethroning.
 */
export function cardScene(W: number, H: number, input: { season: number; rank: Rank; avatar: AvatarSource; mood: SceneMood }): Pixels {
  const crowned = input.mood !== "dethroned";
  const avatar =
    input.mood === "dethroned" ? { ...input.avatar, traits: { ...(input.avatar.traits ?? {}), ex: SURPRISED } } : input.avatar;
  const frame = portraitPixels(avatar, input.rank, { season: input.season, crown: crowned });
  const canvas: Canvas = { px: seasonScene(input.season, W, H, { frame }), W, H };
  if (input.mood === "victory") sparkles(canvas);
  if (input.mood === "challenge") reticle(canvas);
  if (input.mood === "dethroned") fallenCrown(canvas, input.avatar, input.season);
  return canvas.px;
}

export const MAIL_ART = { W: 110, H: 44 } as const;

/** Email header: the dethroned player (no crown), an arrow, and the new king (crowned). */
export function mailHeader(input: {
  season: number;
  you: { avatar: AvatarSource; rank: Rank };
  king: { avatar: AvatarSource; rank: Rank };
}): Pixels {
  const { W, H } = MAIL_ART;
  const px: Pixels = new Array(W * H).fill(null);
  const left = portraitPixels(input.you.avatar, input.you.rank, { season: input.season, crown: false });
  const right = portraitPixels(input.king.avatar, input.king.rank, { season: input.season, crown: true });
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      px[y * W + x] = left[y * FRAME_SIZE + x];
      px[y * W + 66 + x] = right[y * FRAME_SIZE + x];
    }
  }
  ["....#...", "....##..", "#######.", "########", "#######.", "....##..", "....#..."].forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === "#") px[(19 + y) * W + 51 + x] = "#A89FB8";
    }),
  );
  return px;
}

const OWN_FLAGS = new Set<string>(FLAGS);

/** The 12×8 pixel flag, or the country code pill for countries without one. */
export async function flagPixels(code: string): Promise<Pixels> {
  if (!OWN_FLAGS.has(code)) return countryPill(code) as Pixels;
  return svgPixels(await designAsset(`flags/${code}.svg`), 12, 8);
}

export async function medalPixels(code: AchievementCode): Promise<Pixels> {
  return svgPixels(await designAsset(`medals/${MEDAL_KEY[code]}-on.svg`), 24, 24);
}
