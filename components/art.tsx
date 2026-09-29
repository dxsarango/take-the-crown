"use client";

import { useMemo } from "react";
import { FLAGS, countryPillSVG } from "@/design/lib/country-pill.js";
import type { AvatarSource } from "@/lib/art/avatar";
import { pixelsToSVG } from "@/lib/art/avatar";
import { RANK_STYLE } from "@/lib/art/frames";
import { type PortraitOptions, portraitSVG } from "@/lib/art/portrait";
import type { Rank } from "@/lib/game/rank";

/** Inline pixel-art SVG scaled to an integer multiple of its art size. */
function PixelSVG({ svg, width, height, scale, className = "" }: { svg: string; width: number; height: number; scale: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`block flex-none [image-rendering:pixelated] [&>svg]:block [&>svg]:size-full ${className}`}
      style={{ width: width * scale, height: height * scale }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function Portrait({
  avatar,
  rank,
  scale,
  className,
  ...options
}: PortraitOptions & { avatar: AvatarSource; rank: Rank; scale: number; className?: string }) {
  const traitsKey = JSON.stringify(avatar.traits ?? null);
  const svg = useMemo(
    () => portraitSVG(avatar, rank, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value, not identity
    [avatar.seed, traitsKey, rank, options.season, options.crown, options.crownShift],
  );
  return <PixelSVG svg={svg} width={44} height={44} scale={scale} className={className} />;
}

const OWN_FLAGS = new Set<string>(FLAGS);

/** 12×8 flag at ×2; countries without their own flag get the code pill. */
export function Flag({ code, className = "" }: { code: string | null; className?: string }) {
  const pill = useMemo(() => (code && !OWN_FLAGS.has(code) ? countryPillSVG(code, 1) : null), [code]);
  if (!code) return null;
  if (pill) return <PixelSVG svg={pill} width={12} height={8} scale={2} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image
    <img
      src={`/art/flags/${code}.svg`}
      width={24}
      height={16}
      alt=""
      className={`block flex-none [image-rendering:pixelated] ${className}`}
    />
  );
}

/** Monochrome design icon (currentColor), drawn through a CSS mask so it takes the text color. */
export function Icon({ name, size, className = "" }: { name: "pause" | "floor" | "up" | "bang" | "glass"; size: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`block flex-none bg-current ${className}`}
      style={{
        width: size,
        height: size,
        maskImage: `url(/art/icons/${name}.svg)`,
        maskSize: "100% 100%",
        maskRepeat: "no-repeat",
      }}
    />
  );
}

// The design's "dropping" arrow (7×6), drawn in the prototype and not exported as an asset.
const DROP_ARROW = ["..###..", "..###..", "#######", ".#####.", "..###..", "...#..."];
const DROP_ARROW_SVG = pixelsToSVG(
  DROP_ARROW.flatMap((row) => [...row].map((c) => (c === "#" ? "#F3EDE2" : null))),
  7,
  6,
);

export function DropArrow() {
  return <PixelSVG svg={DROP_ARROW_SVG} width={7} height={6} scale={2} className="motion-safe:animate-crown-drop" />;
}

export function RankTag({ rank, label }: { rank: Rank; label: string }) {
  return (
    <span className="flex h-7 items-center gap-2 rounded-tag border border-crown-stone px-2.5">
      <span className="size-2.5" style={{ background: RANK_STYLE[rank].swatch }} />
      <span className="font-pixel text-14 font-medium">{label}</span>
    </span>
  );
}
