import { readAlertOffToken } from "@/lib/email/links";
import { serviceClient } from "@/lib/supabase/service";

/**
 * One-click unsubscribe from an alert email (RFC 8058): mail clients POST here from the
 * List-Unsubscribe header. The link in the email body goes to a page that asks first.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const alert = readAlertOffToken(token);
  if (!alert) return Response.json({ ok: false }, { status: 400 });
  const { error } = await serviceClient().rpc("turn_off_alert", { p_profile_id: alert.profileId, p_kind: alert.kind });
  if (error) {
    console.error("turn_off_alert failed", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true });
}
