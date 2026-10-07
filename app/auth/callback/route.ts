import { NextResponse } from "next/server";
import { safeNext, withParam } from "@/lib/auth/next";
import { ensureProfile } from "@/lib/auth/viewer";
import { serviceClient } from "@/lib/supabase/service";
import { sessionClient } from "@/lib/supabase/session";

/** Magic link and OAuth return: start the session, then claim or create the profile. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const go = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  // Provider errors (a cancelled consent screen, a misconfigured app) and expired links arrive
  // without a code; Supabase passes the reason along, which only the logs should see.
  if (!code) {
    const reason = ["error", "error_code", "error_description"].map((k) => url.searchParams.get(k)).filter(Boolean).join(": ");
    if (reason) console.error("Sign-in came back without a code:", reason.slice(0, 300));
    return go(withParam(next, "auth_error", "failed"));
  }

  const session = await sessionClient();
  const { data, error } = await session.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("Sign-in code exchange failed:", error?.code ?? "", error?.message ?? "no user");
    return go(withParam(next, "auth_error", "failed"));
  }

  // The inbox owner is here: a password someone else set on this email stops working, and sessions
  // opened with it end (decision 53).
  const { error: forgetError } = await serviceClient().rpc("forget_password_access", { p_user_id: data.user.id });
  if (forgetError) console.error("forget_password_access failed", forgetError.message);

  // Profiles are keyed by email; an X account without one cannot own a profile.
  if (!data.user.email) {
    await session.auth.signOut();
    return go(withParam(next, "auth_error", "no_email"));
  }

  await ensureProfile(data.user);
  return go(next);
}
