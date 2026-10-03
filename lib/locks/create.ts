import "server-only";
import { sendMagicLink } from "@/lib/auth/magic-link";
import { currentViewer } from "@/lib/auth/viewer";
import { serverEnv } from "@/lib/env.server";
import { moderate } from "@/lib/moderation";
import { paymentProvider } from "@/lib/payments";
import { verifyHuman } from "@/lib/security/human";
import { withinHourlyLimit } from "@/lib/security/rate-limit";
import { hashIp } from "@/lib/security/request";
import type { Database } from "@/lib/supabase/database.types";
import { serviceClient } from "@/lib/supabase/service";
import { type LockField, type LockOutcome, lockErrorFromDb } from "./outcome";
import { type LockRequest, localHour, lockRequestSchema } from "./input";

type LockArgs = Database["public"]["Functions"]["create_price_lock"]["Args"];
// SQL parameters accept null; the generated types do not say so.
type NullableLockArgs = { [K in keyof LockArgs]: LockArgs[K] | null };

type Buyer = { profileId: string; email: string } | { profileId: null; email: string };

/** Signed-in buyers use their verified email and profile; guests use the email they typed. */
async function resolveBuyer(guestEmail: string | undefined): Promise<Buyer | null> {
  const viewer = await currentViewer();
  if (viewer) return { profileId: viewer.profileId, email: viewer.email };
  return guestEmail ? { profileId: null, email: guestEmail } : null;
}

/**
 * POST /api/locks: validate → human check → rate limit → moderation → create_price_lock → checkout.
 * Moderation runs before any lock exists, so a rejection never holds the crown, and only after the
 * human check and the per-IP limit, so the model cannot be called in bulk.
 */
export async function createLock(body: unknown, ip: string): Promise<LockOutcome> {
  const parsed = lockRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path[0]))].filter(
      (f): f is LockField => typeof f === "string" && ["name", "email", "link", "message", "country", "acceptWithdrawal"].includes(f),
    );
    return { ok: false, error: "invalid_input", fields };
  }
  const input: LockRequest = parsed.data;

  if (!(await verifyHuman(input.turnstileToken, ip, "lock"))) return { ok: false, error: "human_check_failed" };
  const ipHash = hashIp(ip);
  if (!(await withinHourlyLimit(`moderation:${ipHash}`, "max_moderations_per_ip_per_hour"))) {
    return { ok: false, error: "rate_limited" };
  }

  const verdict = await moderate({ name: input.name, message: input.message, link: input.link });
  if (verdict.verdict === "reject") {
    return { ok: false, error: "moderation_rejected", field: verdict.field, reason: verdict.reason };
  }
  // No verdict: the takeover goes ahead, its message and link held for review (decision 31).
  const moderationPending = verdict.verdict === "unavailable" && (input.message !== null || input.link !== null);

  const buyer = await resolveBuyer(input.email);
  if (!buyer) return { ok: false, error: "invalid_input", fields: ["email"] };

  const db = serviceClient();
  const args: NullableLockArgs = {
    p_email: buyer.email,
    p_ip_hash: ipHash,
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
  if (lock) {
    // The acknowledgment is kept with the lock, next to the payment it leads to.
    const { error: markError } = await db
      .from("price_locks")
      .update({ withdrawal_ack_at: new Date().toISOString(), ...(moderationPending ? { moderation_status: "pending" } : {}) })
      .eq("id", lock.id);
    if (markError) {
      await db.rpc("release_price_lock", { p_lock_id: lock.id });
      console.error("could not record the lock's acknowledgment", markError.message);
      return { ok: false, error: "unknown" };
    }
  }

  if (error || !lock) {
    const mapped = lockErrorFromDb(error?.message ?? "");
    if (mapped === "email_verification_required") {
      // Shares the sign-in link limit per address, so nobody can flood someone else's inbox from here.
      if (await withinHourlyLimit(`magic_link_email:${hashIp(buyer.email.toLowerCase())}`, "max_magic_links_per_hour")) {
        await sendMagicLink(buyer.email, `/${input.locale}?resume=1`);
      }
      // The same answer either way: it must not reveal whether the address has a profile.
      return { ok: true, verifyEmail: true };
    }
    if (mapped === "invalid_link") return { ok: false, error: "invalid_input", fields: ["link"] };
    if (mapped) return { ok: false, error: mapped };
    console.error("create_price_lock failed", error?.message);
    return { ok: false, error: "unknown" };
  }

  try {
    const checkout = await (await paymentProvider()).createCheckout({
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
      moderationPending,
    };
  } catch (e) {
    console.error("checkout failed", e);
    await db.rpc("release_price_lock", { p_lock_id: lock.id });
    return { ok: false, error: "checkout_failed" };
  }
}
