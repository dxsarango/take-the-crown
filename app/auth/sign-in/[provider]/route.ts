import { NextResponse } from "next/server";
import { callbackUrl } from "@/lib/auth/magic-link";
import { isOAuthProvider, safeNext, withParam } from "@/lib/auth/next";
import { isProviderEnabled } from "@/lib/auth/providers";
import { sessionClient } from "@/lib/supabase/session";

/** Starts Google or X sign-in. The PKCE verifier is stored in this browser's cookies. */
export async function GET(request: Request, { params }: RouteContext<"/auth/sign-in/[provider]">) {
  const { provider } = await params;
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const back = (error: string) => NextResponse.redirect(new URL(withParam(next, "auth_error", error), url.origin));

  if (!isOAuthProvider(provider)) return new Response("Not found", { status: 404 });
  if (!(await isProviderEnabled(provider))) return back("unavailable");

  const session = await sessionClient();
  const { data, error } = await session.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl(next), skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    console.error(`OAuth sign-in with "${provider}" could not start:`, error?.message ?? "no authorize URL");
    return back("failed");
  }
  return NextResponse.redirect(data.url);
}
