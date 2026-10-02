import { currentViewer } from "@/lib/auth/viewer";
import { sameOrigin } from "@/lib/security/request";
import { serviceClient } from "@/lib/supabase/service";

/** "Remind me when it starts": turns on the season-start alert (SPEC §4, Alerts). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ ok: false }, { status: 403 });
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ ok: false }, { status: 401 });
  const { error } = await serviceClient()
    .from("profile_private")
    .update({ alerts_season_start: true })
    .eq("profile_id", viewer.profileId);
  if (error) return Response.json({ ok: false }, { status: 500 });
  return Response.json({ ok: true });
}
