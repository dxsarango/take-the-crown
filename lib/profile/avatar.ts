import type { AvatarSource, AvatarTraits } from "@/lib/art/avatar";
import { FORMER_KING_PIXELS } from "@/lib/art/former-king";
import { publicEnv } from "@/lib/env";

export const AVATAR_BUCKET = "avatars";

/** Each upload is a folder `<profile id>/<upload id>` with these two files. */
export const AVATAR_FILES = { original: "original.webp", pixel: "pixel.png" } as const;

export type AvatarColumns = {
  avatar_seed: string;
  avatar_traits: unknown;
  avatar_mode: string;
  avatar_path: string | null;
  avatar_pixelated: boolean;
};

export function asTraits(value: unknown): Partial<AvatarTraits> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<AvatarTraits>) : null;
}

export function avatarFileUrl(path: string, file: keyof typeof AVATAR_FILES): string {
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${path}/${AVATAR_FILES[file]}`;
}

/** Reserved for deleted accounts (migration 0018): no one else can have it. */
export const FORMER_KING_SEED = "0".repeat(32);

export function avatarSource(row: AvatarColumns): AvatarSource {
  if (row.avatar_seed === FORMER_KING_SEED) return { seed: row.avatar_seed, traits: null, image: null, pixels: FORMER_KING_PIXELS };
  const image =
    row.avatar_mode === "upload" && row.avatar_path
      ? {
          pixelUrl: avatarFileUrl(row.avatar_path, "pixel"),
          originalUrl: avatarFileUrl(row.avatar_path, "original"),
          pixelated: row.avatar_pixelated,
        }
      : null;
  return { seed: row.avatar_seed, traits: asTraits(row.avatar_traits), image };
}
