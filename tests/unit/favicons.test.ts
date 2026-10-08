import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();
const INK = [0x14, 0x11, 0x1c, 255];

async function pixels(file: string) {
  const { data, info } = await sharp(path.join(ROOT, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  return { width: info.width, height: info.height, at };
}

/** The design's crown as 16×16 colors (null where transparent). */
async function designCrown(): Promise<(string | null)[][]> {
  const svg = await readFile(path.join(ROOT, "design/assets/crowns/icon-16.svg"), "utf8");
  const grid: (string | null)[][] = Array.from({ length: 16 }, () => Array(16).fill(null));
  for (const [, fill, d] of svg.matchAll(/<path fill="(#[0-9A-Fa-f]{6})" d="([^"]+)"/g)) {
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let col = Number(x); col < Number(x) + Number(w); col++) grid[Number(y)][col] = fill.toUpperCase();
    }
  }
  return grid;
}

const hex = ([r, g, b, a]: number[]) => (a === 0 ? null : `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`);

describe("favicon set (pnpm favicons)", () => {
  it.each([
    ["app/icon1.png", 1],
    ["app/icon2.png", 2],
  ])("%s is the design's 16×16 crown at %i×, transparent", async (file, scale) => {
    const crown = await designCrown();
    const png = await pixels(file);
    expect([png.width, png.height]).toEqual([16 * scale, 16 * scale]);
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) expect(hex(png.at(x, y)), `${file} ${x},${y}`).toBe(crown[Math.floor(y / scale)][Math.floor(x / scale)]);
    }
  });

  it.each([
    ["app/apple-icon.png", 180, 10],
    ["public/icons/icon-192.png", 192, 8],
    ["public/icons/icon-512.png", 512, 22],
  ])("%s is %ipx, the crown at an integer %i× on the app's background, no smoothing", async (file, size, scale) => {
    const png = await pixels(file);
    expect([png.width, png.height]).toEqual([size, size]);
    expect(png.at(0, 0)).toEqual(INK);
    // Every pixel is fully opaque and either the background or one of the crown's colors.
    const crownColors = new Set((await designCrown()).flat().filter(Boolean));
    const seen = new Set<string>();
    const strays: string[] = [];
    let painted = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = png.at(x, y);
        const color = hex(p)!;
        if (p[3] !== 255) strays.push(`${x},${y} alpha ${p[3]}`);
        else if (color !== hex(INK)) {
          if (!crownColors.has(color)) strays.push(`${x},${y} ${color}`);
          seen.add(color);
          painted++;
        }
      }
    }
    expect(strays.slice(0, 5)).toEqual([]);
    expect(seen).toEqual(crownColors);
    // Each crown pixel is a solid scale×scale block: the painted area is a multiple of scale².
    expect(painted % (scale * scale)).toBe(0);
  });

  it.each([
    ["public/icons/icon-192-maskable.png", 192, 8],
    ["public/icons/icon-512-maskable.png", 512, 23],
  ])("%s keeps the whole crown inside the circle every launcher mask leaves visible", async (file, size, scale) => {
    const png = await pixels(file);
    expect([png.width, png.height]).toEqual([size, size]);
    expect(png.at(0, 0)).toEqual(INK);
    let farthest = 0;
    let painted = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (hex(png.at(x, y)) === hex(INK)) continue;
        painted++;
        // The pixel's far corner from the icon's center, against a radius of 40% of the side.
        const dx = Math.abs(x + 0.5 - size / 2) + 0.5;
        const dy = Math.abs(y + 0.5 - size / 2) + 0.5;
        farthest = Math.max(farthest, Math.hypot(dx, dy));
      }
    }
    expect(painted % (scale * scale)).toBe(0);
    expect(farthest).toBeLessThanOrEqual(size * 0.4 + 1);
    // And it is the largest integer scale that fits: one more would reach outside.
    expect((farthest / scale) * (scale + 1)).toBeGreaterThan(size * 0.4);
  });

  it("lists the maskable files in the manifest, apart from the plain ones", async () => {
    vi.doMock("@/lib/config/brand", () => ({ BRAND_NAME: "Take the Crown" }));
    const { default: manifest } = await import("@/app/manifest");
    const icons = manifest().icons ?? [];
    expect(icons.filter((i) => i.purpose === "maskable").map((i) => i.src)).toEqual(["/icons/icon-192-maskable.png", "/icons/icon-512-maskable.png"]);
    expect(icons.filter((i) => i.purpose === "any").map((i) => i.src)).toEqual(["/icons/icon-192.png", "/icons/icon-512.png"]);
    for (const icon of icons) await expect(readFile(path.join(ROOT, "public", icon.src))).resolves.toBeDefined();
  });

  it("serves the design's SVG without its embedded metadata", async () => {
    const svg = await readFile(path.join(ROOT, "app/icon.svg"), "utf8");
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 16 16"[^>]*shape-rendering="crispEdges"/);
    expect(svg).not.toContain("metadata");
  });
});
