import { NextResponse } from "next/server";
import { safeNext, withParam } from "@/lib/auth/next";
import { ensureProfile } from "@/lib/auth/viewer";
import { sessionClient } from "@/lib/supabase/session";

/** Magic link and OAuth return: start the session, then claim or create the profile. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const go = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  // Provider errors (a cancelled consent screen) and expired links arrive without a code.
  if (!code) return go(withParam(next, "auth_error", "failed"));

  const session = await sessionClient();
  const { data, error } = await session.auth.exchangeCodeForSession(code);
  if (error || !data.user) return go(withParam(next, "auth_error", "failed"));

  // Profiles are keyed by email; an X account without one cannot own a profile.
  if (!data.user.email) {
    await session.auth.signOut();
    return go(withParam(next, "auth_error", "no_email"));
  }

  await ensureProfile(data.user);
  return go(next);
}
