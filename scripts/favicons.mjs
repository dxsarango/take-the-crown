// Builds the favicon set from the design's official 16×16 crown (design/assets/crowns/icon-16.svg).
// Every PNG is the same pixel grid at an integer scale, nearest neighbour, never resampled. Run
// `pnpm favicons` after the design's crown changes and commit the output.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "design", "assets", "crowns", "icon-16.svg");
// --crown-ink, the app's background (design/tokens/tokens.css).
const BACKGROUND = "#14111C";

const svg = await readFile(SOURCE, "utf8");
const SIZE = 16;
const grid = Array.from({ length: SIZE * SIZE }, () => null);
for (const [, fill, d] of svg.matchAll(/<path fill="(#[0-9A-Fa-f]{6})" d="([^"]+)"/g)) {
  // The design's pixel paths: "Mx yhWv1h-Wz" rectangles, one row high.
  for (const [, x, y, w, h] of d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g)) {
    for (let row = Number(y); row < Number(y) + Number(h); row++) {
      for (let col = Number(x); col < Number(x) + Number(w); col++) grid[row * SIZE + col] = fill;
    }
  }
}
if (grid.every((p) => p === null)) throw new Error(`No pixels read from ${SOURCE}`);

// The crown's bounding box, to center it on square icons with a background.
const painted = grid.flatMap((p, i) => (p ? [[i % SIZE, Math.floor(i / SIZE)]] : []));
const box = {
  left: Math.min(...painted.map(([x]) => x)),
  top: Math.min(...painted.map(([, y]) => y)),
  width: Math.max(...painted.map(([x]) => x)) - Math.min(...painted.map(([x]) => x)) + 1,
  height: Math.max(...painted.map(([, y]) => y)) - Math.min(...painted.map(([, y]) => y)) + 1,
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * A `size`×`size` PNG with the crown at `scale`. Without a background the whole 16×16 grid is
 * scaled (the design's own margins); with one the crown's bounding box is centered.
 */
async function png(size, scale, background = null) {
  const pixels = Buffer.alloc(size * size * 4);
  const [left, top, cols, rows] = background ? [box.left, box.top, box.width, box.height] : [0, 0, SIZE, SIZE];
  const offsetX = Math.floor((size - cols * scale) / 2);
  const offsetY = Math.floor((size - rows * scale) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const col = Math.floor((x - offsetX) / scale);
      const row = Math.floor((y - offsetY) / scale);
      const inside = x >= offsetX && y >= offsetY && col < cols && row < rows;
      const fill = inside ? grid[(top + row) * SIZE + left + col] : null;
      const color = fill ?? background;
      if (!color) continue;
      pixels.set([...rgb(color), 255], (y * size + x) * 4);
    }
  }
  return sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

// The SVG favicon: the design's file without its embedded provenance metadata.
const cleanSvg = svg
  .replace(/<metadata>[\s\S]*?<\/metadata>/, "")
  .replace(/ xmlns:c2pa="[^"]*"/, "")
  .trim();

const outputs = [
  ["app/icon.svg", cleanSvg + "\n"],
  ["app/icon1.png", await png(16, 1)],
  ["app/icon2.png", await png(32, 2)],
  // Touch and launcher icons need a background (iOS fills transparency with black). The scales
  // keep the crown inside the 80% safe zone of maskable icons.
  ["app/apple-icon.png", await png(180, 10, BACKGROUND)],
  ["public/icons/icon-192.png", await png(192, 8, BACKGROUND)],
  ["public/icons/icon-512.png", await png(512, 22, BACKGROUND)],
];
for (const [file, data] of outputs) {
  await mkdir(path.dirname(path.join(ROOT, file)), { recursive: true });
  await writeFile(path.join(ROOT, file), data);
  console.log(`wrote ${file}`);
}
