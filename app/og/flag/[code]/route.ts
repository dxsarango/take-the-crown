import { flagPixels } from "@/lib/og/art";
import { pixelsPNG } from "@/lib/og/raster";

/** A 12×8 pixel flag (or country pill) as PNG at ×4, for emails, where SVG images do not show. */
export async function GET(_request: Request, { params }: RouteContext<"/og/flag/[code]">) {
  const match = /^([A-Z]{2})\.png$/.exec((await params).code);
  if (!match) return new Response("Not found", { status: 404 });
  const png = await pixelsPNG(await flagPixels(match[1]), 12, 8, 4);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
