import "server-only";
import { serverEnv } from "@/lib/env.server";
import { moderate } from "@/lib/moderation";
import { paymentProvider } from "@/lib/payments";
import { verifyHuman } from "@/lib/security/human";
import { hashIp } from "@/lib/security/request";
import type { Database } from "@/lib/supabase/database.types";
import { serviceClient } from "@/lib/supabase/service";
import { sessionClient } from "@/lib/supabase/session";
import { type LockField, type LockOutcome, lockErrorFromDb } from "./outcome";
import { type LockRequest, localHour, lockRequestSchema } from "./input";

type LockArgs = Database["public"]["Functions"]["create_price_lock"]["Args"];
// SQL parameters accept null; the generated types do not say so.
type NullableLockArgs = { [K in keyof LockArgs]: LockArgs[K] | null };

type Buyer = { profileId: string; email: string } | { profileId: null; email: string };

/** Signed-in buyers use their verified email and profile; guests use the email they typed. */
async function resolveBuyer(guestEmail: string | undefined): Promise<Buyer | null> {
  const session = await sessionClient();
  const { data } = await session.auth.getUser();
  const user = data.user;
  if (user?.email) {
    const db = serviceClient();
    const { data: profileId, error } = await db.rpc("ensure_profile_for_user", {
      p_user_id: user.id,
      p_email: user.email,
      p_name_hint: (user.user_metadata?.full_name as string | undefined) ?? "",
    });
    if (error || !profileId) throw new Error(`Could not resolve profile: ${error?.message}`);
    return { profileId, email: user.email };
  }
  return guestEmail ? { profileId: null, email: guestEmail } : null;
}

async function sendSignInLink(email: string, locale: string): Promise<void> {
  const session = await sessionClient();
  const next = `/${locale}?resume=1`;
  const { error } = await session.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${serverEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  // Deliberately not surfaced: the answer must not depend on what happens to the email.
  if (error) console.error("sign-in link failed", error.message);
}

/**
 * POST /api/locks: validate → human check → moderation → create_price_lock → checkout.
 * Moderation runs before any lock exists, so a rejection never holds the crown.
 */
export async function createLock(body: unknown, ip: string): Promise<LockOutcome> {
  const parsed = lockRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path[0]))].filter(
      (f): f is LockField => typeof f === "string" && ["name", "email", "link", "message", "country"].includes(f),
    );
    return { ok: false, error: "invalid_input", fields };
  }
  const input: LockRequest = parsed.data;

  if (!(await verifyHuman(input.turnstileToken, ip))) return { ok: false, error: "human_check_failed" };

  const verdict = await moderate({ name: input.name, message: input.message, link: input.link });
  if (verdict.verdict === "reject") {
    return { ok: false, error: "moderation_rejected", field: verdict.field, reason: verdict.reason };
  }

  const buyer = await resolveBuyer(input.email);
  if (!buyer) return { ok: false, error: "invalid_input", fields: ["email"] };

  const db = serviceClient();
  const args: NullableLockArgs = {
    p_email: buyer.email,
    p_ip_hash: hashIp(ip),
    p_profile_id: buyer.profileId,
    p_name: input.name,
    p_country_code: input.country,
    p_message: input.message,
    p_link: input.link,
    p_local_hour: localHour(input.timeZone),
    p_locale: input.locale,
    p_avatar_seed: input.avatarSeed ?? null,
  };
  const { data: lock, error } = await db.rpc("create_price_lock", args as LockArgs);

  if (error || !lock) {
    const mapped = lockErrorFromDb(error?.message ?? "");
    if (mapped === "email_verification_required") {
      await sendSignInLink(buyer.email, input.locale);
      return { ok: true, verifyEmail: true };
    }
    if (mapped === "invalid_link") return { ok: false, error: "invalid_input", fields: ["link"] };
    if (mapped) return { ok: false, error: mapped };
    console.error("create_price_lock failed", error?.message);
    return { ok: false, error: "unknown" };
  }

  try {
    const checkout = await paymentProvider().createCheckout({
      lockId: lock.id,
      priceCents: lock.price_cents,
      email: buyer.email,
      locale: input.locale,
      successUrl: `${serverEnv().NEXT_PUBLIC_SITE_URL}/${input.locale}?lock=${lock.id}`,
    });
    const { error: checkoutError } = await db.rpc("set_lock_checkout", {
      p_lock_id: lock.id,
      p_checkout_id: checkout.checkoutId,
    });
    if (checkoutError) throw new Error(checkoutError.message);
    return {
      ok: true,
      lockId: lock.id,
      priceCents: lock.price_cents,
      expiresAt: lock.expires_at,
      checkout: { mode: checkout.mode, url: checkout.url },
    };
  } catch (e) {
    console.error("checkout failed", e);
    await db.rpc("release_price_lock", { p_lock_id: lock.id });
    return { ok: false, error: "checkout_failed" };
  }
}
