import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AVATAR_SIZE, type AvatarSource, type Pixels } from "@/lib/art/avatar";

/** Pixels → PNG at an integer scale, nearest neighbour, so no resampler ever touches the art. */
export async function pixelsPNG(pixels: Pixels, width: number, height: number, scale: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  pixels.forEach((color, i) => {
    if (!color) return;
    const n = parseInt(color.slice(1, 7), 16);
    raw.writeUInt32BE(((n << 8) | 0xff) >>> 0, i * 4);
  });
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .resize(width * scale, height * scale, { kernel: "nearest" })
    .png()
    .toBuffer();
}

export function dataURL(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}

function readPixels(data: Buffer, width: number, height: number): Pixels {
  const pixels: Pixels = new Array(width * height).fill(null);
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] < 128) continue;
    pixels[i] = `#${[0, 1, 2].map((k) => data[i * 4 + k].toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  return pixels;
}

/** A pixel-art SVG from the design handoff (crispEdges, one unit per pixel) read back as pixels. */
export async function svgPixels(svg: string, width: number, height: number): Promise<Pixels> {
  const { data } = await sharp(Buffer.from(svg)).resize(width, height, { kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return readPixels(data, width, height);
}

const DESIGN_ASSETS = path.join(process.cwd(), "design", "assets");

/** A file from design/assets (flags, medals), read from disk. */
export async function designAsset(file: string): Promise<string> {
  const resolved = path.join(DESIGN_ASSETS, file);
  if (!resolved.startsWith(DESIGN_ASSETS + path.sep)) throw new Error(`Outside design assets: ${file}`);
  return readFile(resolved, "utf8");
}

/**
 * Uploaded avatars are drawn from their 32×32 pixel version, so they stay pixel art at any scale.
 * Returns the source unchanged for generated avatars, or when the upload cannot be read.
 */
export async function withUploadPixels(source: AvatarSource): Promise<AvatarSource> {
  if (!source.image || source.pixels) return source;
  try {
    const response = await fetch(source.image.pixelUrl, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return { ...source, image: null };
    const { data } = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(AVATAR_SIZE, AVATAR_SIZE, { kernel: "nearest", fit: "cover" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { ...source, pixels: readPixels(data, AVATAR_SIZE, AVATAR_SIZE) };
  } catch {
    return { ...source, image: null };
  }
}
