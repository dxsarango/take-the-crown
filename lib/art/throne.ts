import { pixelsToSVG } from "./avatar";
import { FRAME_SIZE } from "./frames";
import { seasonScene } from "./scenes";

/**
 * The throne room is served as one static SVG per season, variant and size. It is wider than any
 * screen at its pixel scale and centered, so it grows sideways without stretching. The king's
 * portrait is laid over the seat at the same scale.
 */
export const THRONE_SIZES = {
  // 98×72 at ×4 is the 390 px design; 256 columns cover screens up to 1024 px.
  mobile: { width: 256, height: 72, scale: 4 },
  // 240×84 at ×6 is the 1440 px design; 428 columns cover screens up to 2568 px.
  desktop: { width: 428, height: 84, scale: 6 },
} as const;

export type ThroneSize = keyof typeof THRONE_SIZES;
export const THRONE_VARIANTS = ["seat", "spot"] as const;
export type ThroneVariant = (typeof THRONE_VARIANTS)[number];
export const THRONE_SEASONS = [0, 1, 2] as const;

export function throneFile(season: number, variant: ThroneVariant, size: ThroneSize): string {
  return `t${season}-${variant}-${size}.svg`;
}

export function parseThroneFile(
  file: string,
): { season: number; variant: ThroneVariant; size: ThroneSize } | null {
  const match = /^t(\d+)-(seat|spot)-(mobile|desktop)\.svg$/.exec(file);
  if (!match) return null;
  const season = Number(match[1]);
  if (!THRONE_SEASONS.some((s) => s === season)) return null;
  return { season, variant: match[2] as ThroneVariant, size: match[3] as ThroneSize };
}

export function throneSVG(season: number, variant: ThroneVariant, size: ThroneSize): string {
  const { width, height } = THRONE_SIZES[size];
  // "seat": empty backrest for the portrait overlay. "spot": empty throne with the crown on the cushion.
  const pixels =
    variant === "seat"
      ? seasonScene(season, width, height, { frame: new Array(FRAME_SIZE * FRAME_SIZE).fill(null) })
      : seasonScene(season, width, height, { spot: true });
  return pixelsToSVG(pixels, width, height);
}
