"use client";

import { useMemo } from "react";
import { type AvatarSource, avatarPixels, pixelsToSVG } from "@/lib/art/avatar";
import { MEDAL_KEY, type AchievementCode } from "@/lib/game/achievements";
import { SEASON_RING_HEX } from "@/lib/game/rarity";
import type { Rarity } from "@/lib/profile/public";
import { PLATFORMS, type SocialKey } from "@/lib/profile/socials";
import { artSet } from "@/lib/art/seasons";

const RARITY_COLOR: Record<Exclude<Rarity, "seasonal">, string> = {
  common: "var(--crown-rarity-common)",
  rare: "var(--crown-rarity-rare)",
  epic: "var(--crown-rarity-epic)",
  legendary: "var(--crown-rarity-legendary)",
};

export function rarityColor(rarity: Rarity, seasonId: number | null): string {
  return rarity === "seasonal" ? (SEASON_RING_HEX[artSet(seasonId ?? 0)] ?? SEASON_RING_HEX[0]) : RARITY_COLOR[rarity];
}

/** 24×24 medal at an integer scale, lit or unearned. */
export function Medal({ code, on, scale, className = "" }: { code: AchievementCode; on: boolean; scale: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image
    <img
      src={`/art/medals/${MEDAL_KEY[code]}-${on ? "on" : "off"}.svg`}
      width={24 * scale}
      height={24 * scale}
      alt=""
      className={`block flex-none [image-rendering:pixelated] ${className}`}
    />
  );
}

/** Monochrome platform logo (currentColor) through a CSS mask. */
export function SocialIcon({ platform, size }: { platform: SocialKey; size: number }) {
  return (
    <span
      aria-hidden
      className="block flex-none bg-current"
      style={{
        width: size,
        height: size,
        maskImage: `url(/art/icons/social/${PLATFORMS[platform].icon}.svg)`,
        maskSize: "100% 100%",
        maskRepeat: "no-repeat",
      }}
    />
  );
}

// Frost reuses the Genesis frame until the design ships its own (placeholder).
const FRAME_FILE = { genesis: "season-t0-genesis", marigold: "season-t1-marigold", frost: "season-t0-genesis" } as const;

/** A season's collectible frame around the player's avatar (no crown); grey when not earned. */
export function SeasonFrame({
  frame,
  avatar,
  season,
  locked,
  scale,
}: {
  frame: keyof typeof FRAME_FILE;
  avatar: AvatarSource;
  season: number;
  locked: boolean;
  scale: number;
}) {
  const traitsKey = JSON.stringify(avatar.traits ?? null);
  const svg = useMemo(
    () => pixelsToSVG(avatarPixels(avatar, { season, crown: false }), 32, 32),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value, not identity
    [avatar.seed, traitsKey, avatar.image?.pixelUrl, season],
  );
  const image = avatar.image;
  return (
    <span className="relative block flex-none" style={{ width: 44 * scale, height: 44 * scale }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image
        <img
          src={image.pixelated ? image.pixelUrl : image.originalUrl}
          alt=""
          className={`absolute object-cover ${image.pixelated ? "[image-rendering:pixelated]" : ""}`}
          style={{ left: 6 * scale, top: 6 * scale, width: 32 * scale, height: 32 * scale }}
        />
      ) : (
        <span
          aria-hidden
          className="absolute block [image-rendering:pixelated] [&>svg]:block [&>svg]:size-full"
          style={{ left: 6 * scale, top: 6 * scale, width: 32 * scale, height: 32 * scale }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image */}
      <img
        src={`/art/frames/${FRAME_FILE[frame]}${locked ? "-locked" : ""}.svg`}
        width={44 * scale}
        height={44 * scale}
        alt=""
        className="absolute inset-0 block [image-rendering:pixelated]"
      />
    </span>
  );
}

/** 20 (or 10) flat segments, lit from the left: rank and goal progress. */
export function Segments({ lit, total, color, height }: { lit: number; total: number; color: string; height: number }) {
  return (
    <div className="flex gap-0.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="flex-1" style={{ height, background: i < lit ? color : "var(--crown-hall)" }} />
      ))}
    </div>
  );
}

const ROMAN: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function roman(n: number): string {
  let rest = n;
  let out = "";
  for (const [value, symbol] of ROMAN) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

/** "118h 24m" → [{v: "118", u: "h"}, {v: "24", u: "m"}] for the big Pixelify figures. */
export function figureParts(text: string): { v: string; u: string }[] {
  return text.split(" ").map((part) => {
    const match = /^(\d+)(\D*)$/.exec(part);
    return match ? { v: match[1], u: match[2] } : { v: part, u: "" };
  });
}
