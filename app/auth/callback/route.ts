import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { sessionClient } from "@/lib/supabase/session";

/** Magic-link (and later OAuth) return: start the session and claim or create the profile. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/";
  // Only same-site paths, never "//evil.example".
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const session = await sessionClient();
    const { data, error } = await session.auth.exchangeCodeForSession(code);
    if (!error && data.user?.email) {
      await serviceClient().rpc("ensure_profile_for_user", {
        p_user_id: data.user.id,
        p_email: data.user.email,
        p_name_hint: (data.user.user_metadata?.full_name as string | undefined) ?? "",
      });
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
