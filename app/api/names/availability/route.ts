import { currentViewer } from "@/lib/auth/viewer";
import { NAME_PATTERN } from "@/lib/locks/input";
import { serviceClient } from "@/lib/supabase/service";

/** Live public-name check for the payment modal and edit profile (your own names count as free). */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (!NAME_PATTERN.test(name)) return Response.json({ valid: false, available: false });
  const viewer = await currentViewer();
  const { data, error } = await serviceClient().rpc("is_profile_name_available", {
    p_name: name,
    ...(viewer ? { p_profile_id: viewer.profileId } : {}),
  });
  if (error) return new Response(null, { status: 500 });
  return Response.json({ valid: true, available: data === true }, { headers: { "Cache-Control": "no-store" } });
}
