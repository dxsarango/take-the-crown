import { readFileSync } from "node:fs";

/** Reads a design-handoff pixel SVG (one path per color, 1-pixel-high runs) into a pixel grid. */
export function readPixelSVG(path: string): { width: number; height: number; pixels: (string | null)[] } {
  const svg = readFileSync(path, "utf8");
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (!viewBox) throw new Error(`No viewBox in ${path}`);
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  const pixels: (string | null)[] = new Array(width * height).fill(null);
  for (const [, fill, d] of svg.matchAll(/<path fill="(#[0-9A-Fa-f]{6})" d="([^"]+)"/g)) {
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let i = 0; i < Number(w); i++) pixels[Number(y) * width + Number(x) + i] = fill.toUpperCase();
    }
  }
  return { width, height, pixels };
}

/** Number of differing pixels, for readable assertion messages. */
export function pixelDiff(a: (string | null)[], b: (string | null)[]): number {
  let n = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if ((a[i] ?? null) !== (b[i] ?? null)) n++;
  return n;
}
