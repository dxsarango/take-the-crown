import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderAvatar, traitsFromUsername } from "@/design/lib/avatar-lib.js";
import { framePixels } from "@/lib/art/frames";
import { seasonScene } from "@/lib/art/scenes";
import { RANKS } from "@/lib/game/rank";
import { pixelDiff, readPixelSVG } from "../helpers/svg-pixels";

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

  for (const season of [0, 1]) {
    for (const size of sizes) {
      for (const [variant, options] of Object.entries(variants)) {
        const path = `${ASSETS}/scenes/t${season}/${size}-${variant}.svg`;
        it(`t${season} ${size} ${variant}`, ({ skip }) => {
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
});
