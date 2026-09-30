import { z } from "zod";
import { AVATAR_SIZE, avatarPixels, pixelsToSVG } from "@/lib/art/avatar";
import { withUploadPixels } from "@/lib/og/raster";
import { profileIdForName } from "@/lib/profile/public";
import { fetchPeople } from "@/lib/realm/data";
import { publicClient } from "@/lib/supabase/public";

const query = z.object({
  season: z.coerce.number().int().min(0).max(99).default(0),
  crown: z.enum(["0", "1"]).default("0"),
});

/**
 * A player's 32×32 avatar as SVG (SPEC §8): `/avatar/<name>.svg?season=&crown=1`. Generated avatars
 * come from the seed and trait overrides; uploads from their pixel version. Former names work too.
 */
export async function GET(request: Request, { params }: RouteContext<"/avatar/[file]">) {
  const { file } = await params;
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const name = /^(.+)\.svg$/.exec(decodeURIComponent(file))?.[1];
  if (!parsed.success || !name) return new Response("Not found", { status: 404 });

  const db = publicClient();
  const profileId = await profileIdForName(db, name.toLowerCase());
  const person = profileId ? (await fetchPeople(db, [profileId])).get(profileId) : undefined;
  if (!person) return new Response("Not found", { status: 404 });

  const avatar = await withUploadPixels(person.avatar);
  const svg = pixelsToSVG(avatarPixels(avatar, { season: parsed.data.season, crown: parsed.data.crown === "1" }), AVATAR_SIZE, AVATAR_SIZE);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Keyed by season in the URL; a trait or photo change shows up within a day.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
