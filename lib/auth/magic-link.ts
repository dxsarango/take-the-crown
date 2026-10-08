import "server-only";
import { serverEnv } from "@/lib/env.server";
import { sessionClient } from "@/lib/supabase/session";
import { redactEmails } from "@/lib/security/redact";

/** Absolute callback URL that finishes sign-in and then opens `next`. */
export function callbackUrl(next: string): string {
  return `${serverEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`;
}

/**
 * Emails a sign-in link (15 minutes). The PKCE verifier goes into this browser's cookies, so the
 * link has to be opened on the same device. Failures are logged, never shown: the answer must not
 * reveal anything about the address.
 */
export async function sendMagicLink(email: string, next: string): Promise<void> {
  const session = await sessionClient();
  const { error } = await session.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: callbackUrl(next) },
  });
  if (error) console.error("magic link failed", redactEmails(error.message));
}
