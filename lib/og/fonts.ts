import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Font = { name: string; data: ArrayBuffer; weight: 500 | 700; style: "normal" };

const FILES = [
  { name: "Manrope", file: "manrope-latin-500-normal.woff", weight: 500 },
  { name: "Manrope", file: "manrope-latin-700-normal.woff", weight: 700 },
  { name: "Pixelify Sans", file: "pixelify-sans-latin-500-normal.woff", weight: 500 },
  { name: "Pixelify Sans", file: "pixelify-sans-latin-700-normal.woff", weight: 700 },
] as const;

let cached: Promise<Font[]> | null = null;

/** Manrope and Pixelify Sans (OFL, assets/fonts), embedded in every card as the design asks. */
export function cardFonts(): Promise<Font[]> {
  cached ??= Promise.all(
    FILES.map(async ({ name, file, weight }) => {
      const buffer = await readFile(path.join(process.cwd(), "assets", "fonts", file));
      const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      return { name, data, weight, style: "normal" as const };
    }),
  );
  return cached;
}
