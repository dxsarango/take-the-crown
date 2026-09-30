import { renderAvatar, toSVG, traitsFromUsername } from "@/design/lib/avatar-lib.js";

/** One art pixel per cell, row by row: "#RRGGBB" or null (transparent). */
export type Pixels = (string | null)[];

export type AvatarTraits = ReturnType<typeof traitsFromUsername>;

/** An uploaded photo or logo: the 32×32 palette version and the original (max 512 px). */
export type AvatarImage = { pixelUrl: string; originalUrl: string; pixelated: boolean };

export type AvatarSource = {
  seed: string;
  traits?: Partial<AvatarTraits> | null;
  /** Shown instead of the generated avatar; the crown is still drawn on top. */
  image?: AvatarImage | null;
  /** The upload's 32×32 pixels once decoded, for canvas drawing (coronation). */
  pixels?: Pixels | null;
};

export const AVATAR_SIZE = 32;

/** Seed traits with the profile's per-layer overrides on top. */
export function avatarTraits({ seed, traits }: AvatarSource): AvatarTraits {
  return { ...traitsFromUsername(seed), ...(traits ?? {}) };
}

/** Only the season crown the avatar wears, 32×32. */
export function crownPixels(source: AvatarSource, season: number): Pixels {
  return renderAvatar(avatarTraits(source), { season, layer: "crown" });
}

/**
 * The avatar as pixels. An upload without decoded pixels leaves the face transparent (the page
 * lays the image underneath) and keeps only the crown.
 */
export function avatarPixels(source: AvatarSource, options: { season: number; crown: boolean }): Pixels {
  if (source.pixels) {
    if (!options.crown) return source.pixels;
    const crown = crownPixels(source, options.season);
    return source.pixels.map((c, i) => crown[i] ?? c);
  }
  if (source.image) {
    return options.crown ? crownPixels(source, options.season) : new Array<string | null>(AVATAR_SIZE * AVATAR_SIZE).fill(null);
  }
  return renderAvatar(avatarTraits(source), { season: options.season, crown: options.crown });
}

export function pixelsToSVG(pixels: Pixels, width: number, height: number): string {
  return toSVG(pixels, width, height, { scale: 1 });
}

/** Reads a 32×32 image (the upload's pixel version) into pixels, in the browser. */
export async function decodeAvatarImage(url: string): Promise<Pixels | null> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const data = ctx.getImageData(0, 0, AVATAR_SIZE, AVATAR_SIZE).data;
    const hex = (v: number) => v.toString(16).padStart(2, "0");
    return Array.from({ length: AVATAR_SIZE * AVATAR_SIZE }, (_, i) =>
      data[i * 4 + 3] < 128 ? null : `#${hex(data[i * 4])}${hex(data[i * 4 + 1])}${hex(data[i * 4 + 2])}`.toUpperCase(),
    );
  } catch {
    return null;
  }
}
