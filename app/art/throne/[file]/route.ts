import { THRONE_SEASONS, THRONE_VARIANTS, parseThroneFile, throneFile, throneSVG } from "@/lib/art/throne";

export const dynamicParams = false;

export function generateStaticParams() {
  return THRONE_SEASONS.flatMap((season) =>
    THRONE_VARIANTS.flatMap((variant) =>
      (["mobile", "desktop"] as const).map((size) => ({ file: throneFile(season, variant, size) })),
    ),
  );
}

export async function GET(_request: Request, { params }: RouteContext<"/art/throne/[file]">) {
  const parsed = parseThroneFile((await params).file);
  if (!parsed) return new Response("Not found", { status: 404 });
  return new Response(throneSVG(parsed.season, parsed.variant, parsed.size), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
