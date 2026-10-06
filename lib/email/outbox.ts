import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { type Locale, routing } from "@/i18n/routing";
import { playerName } from "@/lib/game/former";
import { BRAND_NAME } from "@/lib/config/brand";
import { serverEnv } from "@/lib/env.server";
import { formatDuration, formatPercent, formatPrice } from "@/lib/format";
import { fetchPeople } from "@/lib/realm/data";
import { serviceClient } from "@/lib/supabase/service";
import { type AlertKind, alertOffToken } from "./links";
import { type Email, EmailError, sendEmail } from "./provider";
import { Dethroned, type Frame, Notice, renderEmail } from "./templates";
import { seasonTitle } from "@/lib/realm/season-title";

type Db = ReturnType<typeof serviceClient>;
type Notification = { id: number; kind: string; profile_id: string; payload: unknown };
type Recipient = {
  email: string;
  locale: Locale;
  profileId: string;
  isAdmin: boolean;
  alerts: { dethroned: boolean; priceBelowCents: number | null; seasonStart: boolean };
};

/** Nothing to send, and retrying will not change that (alert turned off, stale, bad payload). */
class Skip extends Error {}

const payloads = {
  dethroned: z.object({ reign_id: z.number(), duration_seconds: z.number(), by_profile_id: z.uuid() }),
  price_drop: z.object({ price_cents: z.number(), threshold_cents: z.number(), season_id: z.number() }),
  season_started: z.object({ season_id: z.number(), slug: z.string() }),
  reports_threshold: z.object({ reign_id: z.number(), reports: z.number() }),
  season_extended: z.object({ season_id: z.number(), ends_at: z.string() }),
  season_not_ready: z.object({ season_id: z.number(), starts_at: z.string(), name_final: z.boolean(), art_final: z.boolean() }),
  refunds_stuck: z.object({ count: z.number().int().positive(), oldest_at: z.string() }),
};

function site(): string {
  return serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}

async function recipient(db: Db, profileId: string): Promise<Recipient> {
  const { data, error } = await db
    .from("profile_private")
    .select("email, locale, is_admin, alerts_dethroned, alerts_price_below_cents, alerts_season_start")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new EmailError(`Could not read the recipient: ${error.message}`, true);
  if (!data) throw new Skip("no_recipient");
  return {
    email: data.email,
    locale: routing.locales.find((l) => l === data.locale) ?? routing.defaultLocale,
    profileId,
    isAdmin: data.is_admin,
    alerts: { dethroned: data.alerts_dethroned, priceBelowCents: data.alerts_price_below_cents, seasonStart: data.alerts_season_start },
  };
}

async function frameFor(to: Recipient, seasonId: number, preview: string, foot: string, alert: { kind: AlertKind; label: string } | null): Promise<Frame> {
  return {
    lang: to.locale,
    preview,
    season: await seasonTitle(seasonId, to.locale),
    foot,
    unsubscribe: alert ? { label: alert.label, url: `${site()}/${to.locale}/alerts/off?token=${alertOffToken(to.profileId, alert.kind)}` } : null,
  };
}

/** A date for admin emails, in UTC so every admin reads the same day. */
function adminDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-419" : "en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}

/** One-click unsubscribe headers (RFC 8058) for alert emails. */
function unsubscribeHeaders(to: Recipient, kind: AlertKind): Record<string, string> {
  return {
    "List-Unsubscribe": `<${site()}/api/alerts/off?token=${alertOffToken(to.profileId, kind)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function liveCrown(db: Db) {
  const [crown, config] = await Promise.all([
    db.from("public_crown_state").select("price_cents, season_id, current_reign_id").single(),
    db.from("app_config").select("floor_cents, decay_bps_per_hour").single(),
  ]);
  if (!crown.data || !config.data) throw new EmailError("Could not read the crown", true);
  return { priceCents: crown.data.price_cents ?? config.data.floor_cents, seasonId: crown.data.season_id ?? 0, ...config.data };
}

async function build(db: Db, n: Notification): Promise<Omit<Email, "idempotencyKey">> {
  const to = await recipient(db, n.profile_id);
  const common = await getTranslations({ locale: to.locale, namespace: "common" });
  const home = `${site()}/${to.locale}`;

  switch (n.kind) {
    case "dethroned": {
      if (!to.alerts.dethroned) throw new Skip("alert_off");
      const p = payloads.dethroned.safeParse(n.payload);
      if (!p.success) throw new Skip("bad_payload");
      const t = await getTranslations({ locale: to.locale, namespace: "share" });
      const units = await getTranslations({ locale: to.locale, namespace: "common.units" });
      const [people, crown, reign] = await Promise.all([
        fetchPeople(db, [p.data.by_profile_id]),
        liveCrown(db),
        db.from("public_reigns").select("season_id").eq("id", p.data.reign_id).maybeSingle(),
      ]);
      const newKing = people.get(p.data.by_profile_id);
      if (!newKing) throw new Skip("no_new_king");
      const common = await getTranslations({ locale: to.locale, namespace: "common" });
      const king = { ...newKing, name: playerName(newKing.name, common("formerKing")) };
      const price = formatPrice(crown.priceCents, to.locale);
      const kind: AlertKind = "dethroned";
      const unsub = t("unsub");
      const frame = await frameFor(to, reign.data?.season_id ?? crown.seasonId, t("mPreheader", { price }), t("mFoot", { brand: BRAND_NAME }), { kind, label: unsub });
      const { html, text } = await renderEmail(
        Dethroned({
          frame,
          title: t("mTitle"),
          image: {
            url: `${site()}/og/mail/${p.data.reign_id}`,
            alt: t("mAlt", { name: king.name }),
            you: t("you"),
            newKing: t("newKingOf", { name: king.name }),
          },
          m1: t("m1"),
          duration: formatDuration(p.data.duration_seconds, { h: units("h"), m: units("m"), s: units("s") }),
          m2: t("m2"),
          king: { name: king.name, flagUrl: king.countryCode ? `${site()}/og/flag/${king.countryCode}.png` : null },
          m3: t("m3"),
          price,
          button: { label: t("btn"), url: home },
          note: t("mNote", { percent: formatPercent(crown.decay_bps_per_hour, to.locale), price: formatPrice(crown.floor_cents, to.locale) }),
        }),
      );
      return { to: to.email, subject: t("mSubject", { name: king.name }), html, text, headers: unsubscribeHeaders(to, kind) };
    }

    case "price_drop": {
      if (to.alerts.priceBelowCents === null) throw new Skip("alert_off");
      const p = payloads.price_drop.safeParse(n.payload);
      if (!p.success) throw new Skip("bad_payload");
      const crown = await liveCrown(db);
      // Someone took the crown since: the price is back up and the alert no longer holds.
      if (crown.priceCents > p.data.threshold_cents) throw new Skip("stale");
      const t = await getTranslations({ locale: to.locale, namespace: "email" });
      const share = await getTranslations({ locale: to.locale, namespace: "share" });
      const price = formatPrice(crown.priceCents, to.locale);
      const threshold = formatPrice(p.data.threshold_cents, to.locale);
      const kind: AlertKind = "price_drop";
      const frame = await frameFor(to, crown.seasonId, t("pricePreheader", { threshold }), t("priceFoot", { brand: BRAND_NAME }), { kind, label: t("priceUnsub") });
      const { html, text } = await renderEmail(
        Notice({
          frame,
          title: t("priceTitle", { price }),
          body: t("priceBody", { threshold }),
          button: { label: common("take", { price }), url: home },
          note: share("mNote", { percent: formatPercent(crown.decay_bps_per_hour, to.locale), price: formatPrice(crown.floor_cents, to.locale) }),
        }),
      );
      return { to: to.email, subject: t("priceSubject", { price }), html, text, headers: unsubscribeHeaders(to, kind) };
    }

    case "season_started": {
      if (!to.alerts.seasonStart) throw new Skip("alert_off");
      const p = payloads.season_started.safeParse(n.payload);
      if (!p.success) throw new Skip("bad_payload");
      const t = await getTranslations({ locale: to.locale, namespace: "email" });
      const kind: AlertKind = "season_started";
      const frame = await frameFor(to, p.data.season_id, t("seasonPreheader"), t("seasonFoot", { brand: BRAND_NAME }), { kind, label: t("seasonUnsub") });
      const { html, text } = await renderEmail(
        Notice({ frame, title: t("seasonTitle", { season: frame.season }), body: t("seasonBody"), button: { label: t("seasonBtn"), url: home }, note: null }),
      );
      return { to: to.email, subject: t("seasonSubject", { season: frame.season }), html, text, headers: unsubscribeHeaders(to, kind) };
    }

    case "reports_threshold": {
      if (!to.isAdmin) throw new Skip("not_admin");
      const p = payloads.reports_threshold.safeParse(n.payload);
      if (!p.success) throw new Skip("bad_payload");
      const { data: reign } = await db.from("reigns").select("name, season_id").eq("id", p.data.reign_id).maybeSingle();
      if (!reign) throw new Skip("no_reign");
      const t = await getTranslations({ locale: to.locale, namespace: "email" });
      const values = { count: p.data.reports, id: p.data.reign_id, name: reign.name };
      const frame = await frameFor(to, reign.season_id, t("reportsPreheader", values), t("reportsFoot", { brand: BRAND_NAME }), null);
      const { html, text } = await renderEmail(
        Notice({ frame, title: t("reportsTitle", values), body: t("reportsBody", values), button: { label: t("reportsBtn"), url: `${home}/admin#reports` }, note: null }),
      );
      return { to: to.email, subject: t("reportsSubject", values), html, text };
    }

    case "season_extended": {
      if (!to.isAdmin) throw new Skip("not_admin");
      const p = payloads.season_extended.safeParse(n.payload);
      if (!p.success) throw new Skip("bad_payload");
      const t = await getTranslations({ locale: to.locale, namespace: "email" });
      const frame = await frameFor(to, p.data.season_id, t("extendedPreheader"), t("reportsFoot", { brand: BRAND_NAME }), null);
      const values = { season: frame.season, date: adminDate(p.data.ends_at, to.locale) };
      const { html, text } = await renderEmail(
        Notice({ frame, title: t("extendedTitle", values), body: t("extendedBody", values), button: { label: t("seasonsBtn"), url: `${home}/admin#seasons` }, note: null }),
      );
      return { to: to.email, subject: t("extendedTitle", values), html, text };
    }

    case "season_not_ready": {
      if (!to.isAdmin) throw new Skip("not_admin");
      const p = payloads.season_not_ready.safeParse(n.payload);
      if (!p.success) throw new Skip("bad_payload");
      const t = await getTranslations({ locale: to.locale, namespace: "email" });
      const frame = await frameFor(to, p.data.season_id, t("notReadyPreheader"), t("reportsFoot", { brand: BRAND_NAME }), null);
      const missing = !p.data.name_final && !p.data.art_final ? "both" : p.data.name_final ? "art" : "name";
      const values = { season: frame.season, date: adminDate(p.data.starts_at, to.locale), missing };
      const { html, text } = await renderEmail(
        Notice({ frame, title: t("notReadyTitle", values), body: t("notReadyBody", values), button: { label: t("seasonsBtn"), url: `${home}/admin#seasons` }, note: null }),
      );
      return { to: to.email, subject: t("notReadyTitle", values), html, text };
    }

    case "refunds_stuck": {
      if (!to.isAdmin) throw new Skip("not_admin");
      const p = payloads.refunds_stuck.safeParse(n.payload);
      if (!p.success) throw new Skip("bad_payload");
      const t = await getTranslations({ locale: to.locale, namespace: "email" });
      const crown = await liveCrown(db);
      const values = { count: p.data.count, date: adminDate(p.data.oldest_at, to.locale) };
      const frame = await frameFor(to, crown.seasonId, t("stuckPreheader"), t("reportsFoot", { brand: BRAND_NAME }), null);
      const { html, text } = await renderEmail(
        Notice({ frame, title: t("stuckTitle", values), body: t("stuckBody", values), button: { label: t("stuckBtn"), url: `${home}/admin#refunds` }, note: null }),
      );
      return { to: to.email, subject: t("stuckTitle", values), html, text };
    }

    default:
      throw new Skip("unknown_kind");
  }
}

/** Notifications handled per run: the webhook and the per-minute cron each take a batch. */
const BATCH = 25;

/**
 * Sends pending notifications (SPEC §4 Alerts, §9). Each claim is an attempt; after
 * `max_email_attempts` a notification is given up. Returns what happened, for the cron's answer.
 */
export async function processOutbox(limit = BATCH): Promise<{ sent: number; failed: number; skipped: number }> {
  const db = serviceClient();
  const { data: claimed, error } = await db.rpc("claim_notifications", { p_limit: limit });
  if (error) throw new Error(`claim_notifications failed: ${error.message}`);
  const counts = { sent: 0, failed: 0, skipped: 0 };
  for (const n of claimed ?? []) {
    try {
      const email = await build(db, n);
      await sendEmail({ ...email, idempotencyKey: `notification-${n.id}` });
      await db.rpc("mark_notification_sent", { p_id: n.id });
      counts.sent += 1;
    } catch (e) {
      const skip = e instanceof Skip;
      const final = skip || (e instanceof EmailError && !e.retry);
      const message = e instanceof Error ? e.message : String(e);
      if (!skip) console.error(`notification ${n.id} (${n.kind}) failed:`, message);
      await db.rpc("mark_notification_failed", { p_id: n.id, p_error: skip ? `skipped: ${message}` : message, p_final: final });
      counts[skip ? "skipped" : "failed"] += 1;
    }
  }
  return counts;
}
