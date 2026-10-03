import { currentAdmin } from "@/lib/admin/guard";
import { currentViewer } from "@/lib/auth/viewer";
import { viewerSummary } from "@/lib/profile/viewer";
import { publicClient } from "@/lib/supabase/public";

/** The signed-in player for client components, or null. Pages are cached, so they ask here. */
export async function GET() {
  const viewer = await currentViewer();
  const summary = viewer ? await viewerSummary(publicClient(), viewer.profileId, (await currentAdmin()) !== null) : null;
  return Response.json({ viewer: summary }, { headers: { "Cache-Control": "private, no-store" } });
}
