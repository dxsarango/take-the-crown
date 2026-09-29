import sharp from "sharp";
import palette from "@/design/pixel-art/palette-core.json";

/** Upload rules (SPEC §8, decision 15). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const FORMATS = new Set(["png", "jpeg", "webp"]);
const ORIGINAL_MAX = 512;
const PIXEL_SIZE = 32;
/** Transparent areas become the frame window's stone, as in the edit profile prototype. */
const BACKGROUND: [number, number, number] = [0x2a, 0x24, 0x38];

type RGB = [number, number, number];

function collectColors(node: unknown, out: Set<string>): Set<string> {
  if (typeof node === "string" && /^#[0-9a-f]{6}$/i.test(node)) out.add(node.toUpperCase());
  else if (Array.isArray(node)) node.forEach((n) => collectColors(n, out));
  else if (node && typeof node === "object") Object.values(node).forEach((n) => collectColors(n, out));
  return out;
}

/** Every color of the core pixel-art palette (design/pixel-art/palette-core.json). */
export const CORE_PALETTE: RGB[] = [...collectColors(palette, new Set())].map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]);

/** Nearest palette color by the "redmean" weighted distance, which tracks perception better than plain RGB. */
export function nearestColor([r, g, b]: RGB, colors: RGB[] = CORE_PALETTE): RGB {
  let best = colors[0];
  let bestDistance = Infinity;
  for (const c of colors) {
    const mean = (r + c[0]) / 2;
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    const distance = (2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = c;
    }
  }
  return best;
}

/** RGBA pixels → RGB pixels in the core palette. */
export function quantize(rgba: Uint8Array | Buffer): Buffer {
  const out = Buffer.alloc((rgba.length / 4) * 3);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    const color = rgba[i + 3] < 128 ? BACKGROUND : nearestColor([rgba[i], rgba[i + 1], rgba[i + 2]]);
    out[o] = color[0];
    out[o + 1] = color[1];
    out[o + 2] = color[2];
  }
  return out;
}

export type ProcessedAvatar = { original: Buffer; pixel: Buffer };

/**
 * Checks the real format (never the declared type), then keeps the original at most 512 px as
 * WebP and a 32×32 version: center crop, nearest neighbor, quantized to the core palette.
 */
export async function processAvatar(input: Buffer): Promise<ProcessedAvatar | { error: "type" | "size" }> {
  if (input.length > MAX_UPLOAD_BYTES) return { error: "size" };
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    return { error: "type" };
  }
  if (!format || !FORMATS.has(format)) return { error: "type" };

  try {
    const image = sharp(input, { limitInputPixels: 50_000_000 }).rotate();
    const original = await image
      .clone()
      .resize(ORIGINAL_MAX, ORIGINAL_MAX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    const rgba = await image
      .clone()
      .resize(PIXEL_SIZE, PIXEL_SIZE, { fit: "cover", kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const pixel = await sharp(quantize(rgba), { raw: { width: PIXEL_SIZE, height: PIXEL_SIZE, channels: 3 } })
      .png()
      .toBuffer();
    return { original, pixel };
  } catch {
    return { error: "type" };
  }
}
