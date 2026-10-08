import "server-only";
import { publicEnv } from "@/lib/env";
import type { OAuthProvider } from "./next";
import { errorText, redactEmails } from "@/lib/security/redact";

/**
 * Whether Supabase Auth will start sign-in with this provider (checked before redirecting to it,
 * so a disabled provider shows our notice instead of Supabase's JSON error page). Supabase's
 * authorize endpoint is asked directly: it redirects to the provider when it is enabled. The
 * public `/auth/v1/settings` list cannot answer for X: it reports only the legacy `twitter`
 * (OAuth 1.0a) provider, never `x` (OAuth 2.0). When the answer is no, Supabase's reason is
 * logged so a misconfiguration shows in the logs, not only as the notice.
 */
export async function isProviderEnabled(provider: OAuthProvider): Promise<boolean> {
  const url = new URL("/auth/v1/authorize", publicEnv.NEXT_PUBLIC_SUPABASE_URL);
  url.searchParams.set("provider", provider);
  try {
    const response = await fetch(url, {
      headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) return true;
    const body = await response.text().catch(() => "");
    console.error(`OAuth provider "${provider}" is unavailable: Supabase answered ${response.status} ${redactEmails(body.slice(0, 300))}`);
    return false;
  } catch (error) {
    console.error(`OAuth provider "${provider}" is unavailable: could not reach Supabase Auth`, errorText(error));
    return false;
  }
}
