import { readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderAvatar, traitsFromUsername } from "@/design/lib/avatar-lib.js";
import { FORMER_KING_PIXELS } from "@/lib/art/former-king";
import { framePixels } from "@/lib/art/frames";
import { FORMER_KING_SEED, avatarSource } from "@/lib/profile/avatar";
import { seasonScene } from "@/lib/art/scenes";
import { RANKS } from "@/lib/game/rank";
import { pixelDiff, readPixelSVG } from "../helpers/svg-pixels";

vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" } }));

const ASSETS = "design/assets";
const upper = (pixels: (string | null)[]) => pixels.map((c) => (c ? c.toUpperCase() : null));

describe("avatars", () => {
  const samples = readdirSync(`${ASSETS}/avatar/samples`).filter((f) => f.endsWith(".svg"));

  it.each(samples)("%s matches avatar-lib", (file) => {
    const match = /^t(\d)-(.+?)(-nocrown)?\.svg$/.exec(file);
    if (!match) throw new Error(`Unexpected sample name ${file}`);
    const [, season, name, nocrown] = match;
    const asset = readPixelSVG(`${ASSETS}/avatar/samples/${file}`);
    const pixels = renderAvatar(traitsFromUsername(name), { season: Number(season), crown: !nocrown });
    expect(pixelDiff(upper(pixels), asset.pixels)).toBe(0);
  });
});

describe("former king", () => {
  it("matches the design's silhouette", () => {
    const asset = readPixelSVG(`${ASSETS}/avatar/former-king.svg`);
    expect([asset.width, asset.height]).toEqual([32, 32]);
    expect(pixelDiff(upper(FORMER_KING_PIXELS), asset.pixels)).toBe(0);
  });

  it("replaces a deleted account's avatar, uploads included", () => {
    const deleted = avatarSource({ avatar_seed: FORMER_KING_SEED, avatar_traits: { hair: 3 }, avatar_mode: "upload", avatar_path: "x/y", avatar_pixelated: true });
    expect(deleted).toMatchObject({ image: null, traits: null, pixels: FORMER_KING_PIXELS });
    expect(avatarSource({ avatar_seed: "1".repeat(32), avatar_traits: null, avatar_mode: "generated", avatar_path: null, avatar_pixelated: true }).pixels).toBeUndefined();
  });
});

describe("rank frames", () => {
  it.each(RANKS.map((r) => r.rank))("%s matches the exported frame", (rank) => {
    const asset = readPixelSVG(`${ASSETS}/frames/rank-${rank}.svg`);
    expect(pixelDiff(upper(framePixels(rank, null)), asset.pixels)).toBe(0);
  });
});

describe("scenes", () => {
  const EMPTY_FRAME = new Array(44 * 44).fill(null);
  const variants = {
    empty: {},
    "empty-spot": { spot: true },
    bare: { bare: true },
    seat: { frame: EMPTY_FRAME },
  } as const;
  const sizes = ["98x72", "240x84", "100x90", "120x84"];

  // The design's art sets: T0 is Genesis (season 0), T1 is Day of the Dead (season 12).
  for (const [art, season] of [
    [0, 0],
    [1, 12],
  ]) {
    for (const size of sizes) {
      for (const [variant, options] of Object.entries(variants)) {
        const path = `${ASSETS}/scenes/t${art}/${size}-${variant}.svg`;
        it(`t${art} ${size} ${variant}`, ({ skip }) => {
          let asset;
          try {
            asset = readPixelSVG(path);
          } catch {
            skip();
            return;
          }
          const scene = seasonScene(season, asset.width, asset.height, options);
          expect(pixelDiff(upper(scene), asset.pixels)).toBe(0);
        });
      }
    }
  }

  it("draws Frost (season 1) with the Genesis scene until its art ships", () => {
    expect(seasonScene(1, 98, 72)).toEqual(seasonScene(0, 98, 72));
  });
});
