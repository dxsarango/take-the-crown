import { currentViewer } from "@/lib/auth/viewer";
import { NAME_PATTERN } from "@/lib/locks/input";
import { withinHourlyLimit } from "@/lib/security/rate-limit";
import { clientIp, hashIp } from "@/lib/security/request";
import { serviceClient } from "@/lib/supabase/service";

/** Live public-name check for the payment modal and edit profile (your own names count as free). Limited per IP: names are public, but every check reads the database. */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (!NAME_PATTERN.test(name)) return Response.json({ valid: false, available: false });
  if (!(await withinHourlyLimit(`name_check:${hashIp(clientIp(request.headers))}`, "max_name_checks_per_ip_per_hour"))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const viewer = await currentViewer();
  const { data, error } = await serviceClient().rpc("is_profile_name_available", {
    p_name: name,
    ...(viewer ? { p_profile_id: viewer.profileId } : {}),
  });
  if (error) return new Response(null, { status: 500 });
  return Response.json({ valid: true, available: data === true }, { headers: { "Cache-Control": "no-store" } });
}
