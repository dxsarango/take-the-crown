import { MAIL_ART, mailHeader } from "@/lib/og/art";
import { pixelsPNG, withUploadPixels } from "@/lib/og/raster";
import { fetchPeople } from "@/lib/realm/data";
import { publicClient } from "@/lib/supabase/public";

/**
 * Header image of the "You were dethroned" email for a reign: its king without the crown, an
 * arrow, and the player who took it. Drawn at ×12 so the email's 440 px (÷3) and 330 px (÷4)
 * sizes are exact downscales that keep the pixels square.
 */
export async function GET(_request: Request, { params }: RouteContext<"/og/mail/[id]">) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = publicClient();
  const { data: reign } = await db.from("public_reigns").select("profile_id, season_id, dethroned_by").eq("id", Number(id)).maybeSingle();
  if (!reign?.profile_id || !reign.dethroned_by || reign.season_id === null) return new Response("Not found", { status: 404 });

  const people = await fetchPeople(db, [reign.profile_id, reign.dethroned_by]);
  const you = people.get(reign.profile_id);
  const king = people.get(reign.dethroned_by);
  if (!you || !king) return new Response("Not found", { status: 404 });

  const pixels = mailHeader({
    season: reign.season_id,
    you: { avatar: await withUploadPixels(you.avatar), rank: you.rank },
    king: { avatar: await withUploadPixels(king.avatar), rank: king.rank },
  });
  const png = await pixelsPNG(pixels, MAIL_ART.W, MAIL_ART.H, 12);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, s-maxage=604800" },
  });
}
