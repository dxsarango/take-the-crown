"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { CONFIG_FIELDS, LEGAL_FIELDS, configSchema, legalSchema } from "@/lib/admin/config";
import { currentAdmin } from "@/lib/admin/guard";
import { MODEL_REASONS } from "@/lib/moderation/model";
import { paymentProvider } from "@/lib/payments";
import { serviceClient } from "@/lib/supabase/service";
import { serverEnv } from "@/lib/env.server";
import { revalidateHome } from "@/lib/home/cache";

/**
 * Admin actions (SPEC §13). Each one checks is_admin again: server actions are public endpoints.
 * They answer by redirecting back to the admin page with a one-word status for the notice.
 */

function localeOf(form: FormData): "en" | "es" {
  const value = form.get("locale");
  return routing.locales.find((l) => l === value) ?? routing.defaultLocale;
}

async function done(form: FormData, status: "ok" | "failed", extra: Record<string, string> = {}): Promise<never> {
  revalidatePath("/[locale]/admin", "page");
  revalidateHome();
  const params = new URLSearchParams({ status, ...extra });
  const section = form.get("section");
  return redirect({ href: `/admin?${params}${typeof section === "string" ? `#${section}` : ""}`, locale: localeOf(form) });
}

async function admin() {
  const current = await currentAdmin();
  if (!current) throw new Error("Not an admin");
  return current;
}

const id = z.coerce.number().int().positive();
const uuid = z.uuid();

export async function refundPayment(form: FormData) {
  const me = await admin();
  const paymentId = uuid.safeParse(form.get("paymentId"));
  if (!paymentId.success) return done(form, "failed");
  const { data: payment, error } = await serviceClient().rpc("request_manual_refund", {
    p_payment_id: paymentId.data,
    p_admin_profile_id: me.profileId,
  });
  if (error || !payment) return done(form, "failed");
  try {
    // The provider confirms with a refund webhook, which marks the payment refunded.
    await (await paymentProvider()).refund(payment.provider_payment_id);
  } catch (e) {
    console.error("manual refund failed", e);
    return done(form, "failed");
  }
  return done(form, "ok");
}

export async function hideMessage(form: FormData) {
  const me = await admin();
  const reignId = id.safeParse(form.get("reignId"));
  if (!reignId.success) return done(form, "failed");
  const { error } = await serviceClient().rpc("hide_reign_message", { p_reign_id: reignId.data, p_admin_profile_id: me.profileId });
  return done(form, error ? "failed" : "ok");
}

/** Approves held or rejected content (false positives included), or rejects held content with a reason. */
export async function reviewContent(form: FormData) {
  const me = await admin();
  const reignId = id.safeParse(form.get("reignId"));
  const approved = form.get("decision") === "approve";
  const reason = z.enum(MODEL_REASONS).safeParse(form.get("reason"));
  if (!reignId.success || (!approved && !reason.success)) return done(form, "failed");
  const { error } = await serviceClient().rpc("review_reign_moderation", {
    p_reign_id: reignId.data,
    p_approved: approved,
    p_reason: approved ? (null as unknown as string) : reason.data!,
    p_admin_profile_id: me.profileId,
  });
  if (error) console.error("review_reign_moderation failed", error.message);
  return done(form, error ? "failed" : "ok");
}

export async function setBanned(form: FormData) {
  const me = await admin();
  const profileId = uuid.safeParse(form.get("profileId"));
  if (!profileId.success) return done(form, "failed");
  const { error } = await serviceClient().rpc("set_profile_banned", {
    p_profile_id: profileId.data,
    p_banned: form.get("banned") === "true",
    p_admin_profile_id: me.profileId,
  });
  return done(form, error ? "failed" : "ok");
}

export async function dismissReport(form: FormData) {
  const me = await admin();
  const reportIds = z.array(id).min(1).safeParse(form.getAll("reportId"));
  if (!reportIds.success) return done(form, "failed");
  for (const reportId of reportIds.data) {
    const { error } = await serviceClient().rpc("dismiss_report", { p_report_id: reportId, p_admin_profile_id: me.profileId });
    if (error) return done(form, "failed");
  }
  return done(form, "ok");
}

export async function releaseName(form: FormData) {
  const me = await admin();
  const name = z.string().trim().min(3).max(24).safeParse(form.get("name"));
  if (!name.success) return done(form, "failed");
  const db = serviceClient();
  const { data: released, error } = await db.rpc("release_profile_name", { p_name: name.data });
  if (error) return done(form, "failed");
  if (released) await db.from("admin_actions").insert({ admin_profile_id: me.profileId, action: "release_name", target: name.data });
  return done(form, "ok", { name: name.data, released: released ? "1" : "0" });
}

const seasonDates = z
  .object({ seasonId: z.coerce.number().int().min(0), startsAt: z.iso.datetime({ local: true }), endsAt: z.iso.datetime({ local: true }) })
  .refine((v) => v.startsAt < v.endsAt);

export async function saveSeasonDates(form: FormData) {
  const me = await admin();
  const parsed = seasonDates.safeParse({ seasonId: form.get("seasonId"), startsAt: form.get("startsAt"), endsAt: form.get("endsAt") });
  if (!parsed.success) return done(form, "failed", { reason: "season" });
  const startsAt = new Date(`${parsed.data.startsAt}Z`);
  const endsAt = new Date(`${parsed.data.endsAt}Z`);
  const db = serviceClient();
  const { data: seasons } = await db.from("seasons").select("id, starts_at, ends_at").order("id");
  const season = seasons?.find((s) => s.id === parsed.data.seasonId);
  const previous = seasons?.find((s) => s.id === parsed.data.seasonId - 1);
  const next = seasons?.find((s) => s.id === parsed.data.seasonId + 1);
  // Only seasons that have not started, and never overlapping their neighbours.
  if (
    !season ||
    new Date(season.starts_at) <= new Date() ||
    startsAt <= new Date() ||
    (previous && startsAt < new Date(previous.ends_at)) ||
    (next && endsAt > new Date(next.starts_at))
  ) {
    return done(form, "failed", { reason: "season" });
  }
  const { error } = await db
    .from("seasons")
    .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
    .eq("id", parsed.data.seasonId);
  if (error) return done(form, "failed", { reason: "season" });
  await db.from("admin_actions").insert({
    admin_profile_id: me.profileId,
    action: "season_dates",
    target: String(parsed.data.seasonId),
    details: { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() },
  });
  return done(form, "ok");
}

export async function saveConfig(form: FormData) {
  const me = await admin();
  const parsed = configSchema.safeParse(Object.fromEntries(CONFIG_FIELDS.map((k) => [k, form.get(k)])));
  if (!parsed.success) return done(form, "failed", { reason: "config" });
  const db = serviceClient();
  const { error } = await db
    .from("app_config")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return done(form, "failed", { reason: "config" });
  await db.from("admin_actions").insert({ admin_profile_id: me.profileId, action: "config", details: parsed.data });
  return done(form, "ok");
}

/**
 * Ends prelaunch (launch_game): clears the admins' test reigns and payments, starts season 0 at the
 * given time (UTC) and opens the crown to everyone. Only with the real payment provider.
 */
export async function launchGame(form: FormData) {
  const me = await admin();
  const startsAt = z.iso.datetime({ local: true }).safeParse(form.get("startsAt"));
  if (!startsAt.success || serverEnv().PAYMENT_PROVIDER === "test") return done(form, "failed", { reason: "launch" });
  const at = new Date(`${startsAt.data}Z`).toISOString();
  const db = serviceClient();
  const { error } = await db.rpc("launch_game", { p_starts_at: at });
  if (error) return done(form, "failed", { reason: "launch" });
  await db.from("admin_actions").insert({ admin_profile_id: me.profileId, action: "launch", details: { starts_at: at } });
  return done(form, "ok");
}

/** Shows the season dates a launch at this time would give, before anything changes. */
export async function previewLaunch(form: FormData) {
  await admin();
  const startsAt = z.iso.datetime({ local: true }).safeParse(form.get("startsAt"));
  if (!startsAt.success) return done(form, "failed", { reason: "launch" });
  return redirect({ href: `/admin?launchAt=${encodeURIComponent(`${startsAt.data}Z`)}#launch`, locale: localeOf(form) });
}

export async function saveLegal(form: FormData) {
  const me = await admin();
  const parsed = legalSchema.safeParse(Object.fromEntries(LEGAL_FIELDS.map((k) => [k, form.get(k)])));
  if (!parsed.success) return done(form, "failed", { reason: "legal" });
  const db = serviceClient();
  const { error } = await db
    .from("app_config")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return done(form, "failed", { reason: "legal" });
  await db.from("admin_actions").insert({ admin_profile_id: me.profileId, action: "legal", details: parsed.data });
  return done(form, "ok");
}
