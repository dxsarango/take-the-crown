"use client";

import { useMemo } from "react";
import { FLAGS, countryPillSVG } from "@/design/lib/country-pill.js";
import type { AvatarSource } from "@/lib/art/avatar";
import { pixelsToSVG } from "@/lib/art/avatar";
import { RANK_STYLE } from "@/lib/art/frames";
import { type PortraitOptions, portraitSVG } from "@/lib/art/portrait";
import { seasonArt } from "@/lib/art/seasons";
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
  className = "",
  ...options
}: PortraitOptions & { avatar: AvatarSource; rank: Rank; scale: number; className?: string }) {
  const traitsKey = JSON.stringify(avatar.traits ?? null);
  const image = avatar.pixels ? null : avatar.image;
  const svg = useMemo(
    () => portraitSVG(avatar, rank, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by value, not identity
    [avatar.seed, traitsKey, image?.pixelUrl, avatar.pixels, rank, options.season, options.crown, options.crownShift],
  );
  if (!image) return <PixelSVG svg={svg} width={44} height={44} scale={scale} className={className} />;
  // Uploads sit in the frame's 32×32 window at (6, 6); the frame and crown are drawn over them.
  return (
    <span className={`relative block flex-none ${className}`} style={{ width: 44 * scale, height: 44 * scale }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image */}
      <img
        src={image.pixelated ? image.pixelUrl : image.originalUrl}
        alt=""
        className={`absolute object-cover ${image.pixelated ? "[image-rendering:pixelated]" : ""}`}
        style={{ left: 6 * scale, top: 6 * scale, width: 32 * scale, height: 32 * scale }}
      />
      <PixelSVG svg={svg} width={44} height={44} scale={scale} className="absolute inset-0" />
    </span>
  );
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
type IconName = "pause" | "floor" | "up" | "bang" | "glass" | "close" | "check" | "chev";

export function Icon({
  name,
  size,
  height,
  className = "",
}: {
  name: IconName;
  /** Width in CSS pixels; height defaults to the same. Use integer multiples of the art size. */
  size: number;
  height?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`block flex-none bg-current ${className}`}
      style={{
        width: size,
        height: height ?? size,
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

// Sign-in icon (8×8, currentColor), in the style of the design's 8×8 icons; the design has no user icon.
const PERSON = ["..####..", ".######.", ".######.", "..####..", "........", ".######.", "########", "########"];
const PERSON_SVG = pixelsToSVG(
  PERSON.flatMap((row) => [...row].map((c) => (c === "#" ? "currentColor" : null))),
  8,
  8,
);

export function PersonIcon() {
  return <PixelSVG svg={PERSON_SVG} width={8} height={8} scale={2} />;
}

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

function pixelMap(rows: string[], colors: Record<string, string>): string {
  const cells = rows.flatMap((row) => [...row].map((c) => colors[c] ?? null));
  return pixelsToSVG(cells, rows[0].length, rows.length);
}

// Login icons drawn in the sign-in prototype (Inicio de Sesion.dc.html), not exported as assets.
const PROVIDER_ICONS = {
  google: pixelMap(
    ["..........", "...####...", "..#....#..", ".#........", ".#...####.", ".#......#.", ".#......#.", "..#....#..", "...####...", ".........."],
    { "#": "#F3EDE2" },
  ),
  x: pixelMap(
    ["..........", ".##....##.", "..##..##..", "...####...", "....##....", "....##....", "...####...", "..##..##..", ".##....##.", ".........."],
    { "#": "#F3EDE2" },
  ),
};

const MAIL = pixelMap(
  [
    "oooooooooooooooooooo",
    "obbbbbbbbbbbbbbbbbbo",
    "owbbbbbbbbbbbbbbbbwo",
    "obwbbbbbbbbbbbbbbwbo",
    "obbwbbbbbbbbbbbbwbbo",
    "obbbwbbbbbbbbbbwbbbo",
    "obbbbwwbbbbbbwwbbbbo",
    "obbbbbbwwggwwbbbbbbo",
    "obbbbbbbggggbbbbbbbo",
    "obbbbbbbbggbbbbbbbbo",
    "obbbbbbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbbbbbo",
    "osssssssssssssssssso",
    "oooooooooooooooooooo",
    "....................",
    "....................",
  ],
  { o: "#4E4034", b: "#F3EDE2", w: "#BFB29C", s: "#BFB29C", g: "#3DD68C" },
);

export function ProviderIcon({ provider }: { provider: keyof typeof PROVIDER_ICONS }) {
  return <PixelSVG svg={PROVIDER_ICONS[provider]} width={10} height={10} scale={2} />;
}

export function MailIcon() {
  return <PixelSVG svg={MAIL} width={20} height={16} scale={2} />;
}

/** The season's kingdom seal (20×20). */
export function Seal({ season, scale }: { season: number; scale: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image
    <img
      src={`/art/seal/seal-t${seasonArt(season).asset}.svg`}
      width={20 * scale}
      height={20 * scale}
      alt=""
      className="block flex-none [image-rendering:pixelated]"
    />
  );
}
