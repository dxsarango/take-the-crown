import { renderAvatar, toSVG, traitsFromUsername } from "@/design/lib/avatar-lib.js";

/** One art pixel per cell, row by row: "#RRGGBB" or null (transparent). */
export type Pixels = (string | null)[];

export type AvatarTraits = ReturnType<typeof traitsFromUsername>;

export type AvatarSource = {
  seed: string;
  traits?: Partial<AvatarTraits> | null;
};

export const AVATAR_SIZE = 32;

/** Seed traits with the profile's per-layer overrides on top. */
export function avatarTraits({ seed, traits }: AvatarSource): AvatarTraits {
  return { ...traitsFromUsername(seed), ...(traits ?? {}) };
}

export function avatarPixels(source: AvatarSource, options: { season: number; crown: boolean }): Pixels {
  return renderAvatar(avatarTraits(source), { season: options.season, crown: options.crown });
}

export function pixelsToSVG(pixels: Pixels, width: number, height: number): string {
  return toSVG(pixels, width, height, { scale: 1 });
}
