import type { Rank } from "@/lib/game/rank";
import { type AvatarSource, type Pixels, avatarPixels, pixelsToSVG } from "./avatar";
import { FRAME_SIZE, framePixels } from "./frames";

export type PortraitOptions = {
  season: number;
  /** Past kings are shown without a crown. */
  crown: boolean;
  /** Moves only the crown pixels sideways, for the "someone is taking the crown" shake. */
  crownShift?: -1 | 0 | 1;
};

/** Rank frame with the avatar inside, 44×44 art pixels. */
export function portraitPixels(avatar: AvatarSource, rank: Rank, options: PortraitOptions): Pixels {
  const bare = avatarPixels(avatar, { season: options.season, crown: false });
  if (!options.crown) return framePixels(rank, bare);

  const crowned = avatarPixels(avatar, { season: options.season, crown: true });
  const dx = options.crownShift ?? 0;
  if (dx === 0) return framePixels(rank, crowned);

  const shifted = bare.slice();
  for (let i = 0; i < crowned.length; i++) {
    if (crowned[i] === bare[i]) continue;
    const x = (i % 32) + dx;
    if (x >= 0 && x < 32) shifted[i - (i % 32) + x] = crowned[i];
  }
  return framePixels(rank, shifted);
}

export function portraitSVG(avatar: AvatarSource, rank: Rank, options: PortraitOptions): string {
  return pixelsToSVG(portraitPixels(avatar, rank, options), FRAME_SIZE, FRAME_SIZE);
}
