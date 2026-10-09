import { fetchHomeData } from "@/lib/home/data";
import { snapshotVersionSchema } from "@/lib/home/snapshot";
import { publicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

// Without a version the answer would be shared past the change it should show.
const CACHE = "public, max-age=0, s-maxage=30";

/**
 * The home data for pages that heard the crown change (SPEC §6). `v` names the change they heard
 * (see snapshotVersion): clients that heard the same change request the same URL, so a crowd of
 * viewers costs one read per change instead of one per viewer.
 */
export async function GET(request: Request) {
  if (!snapshotVersionSchema.safeParse(new URL(request.url).searchParams.get("v")).success) {
    return Response.json({ error: "version" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return Response.json(await fetchHomeData(publicClient()), { headers: { "Cache-Control": CACHE } });
  } catch (e) {
    console.error("home snapshot failed", e);
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
