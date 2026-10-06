import "server-only";
import { serviceClient } from "@/lib/supabase/service";

const LIST_SIZE = 50;

export type AdminReport = {
  reignId: number;
  name: string;
  profileId: string;
  message: string | null;
  link: string | null;
  hidden: boolean;
  banned: boolean;
  reports: { id: number; reason: string | null; createdAt: string }[];
};

export type AdminHeld = {
  reignId: number;
  name: string;
  message: string | null;
  link: string | null;
  status: "pending" | "rejected";
  reason: string | null;
  attempts: number;
  startedAt: string;
};

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Failed to load ${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`Failed to load ${what}: no data`);
  return result.data;
}

/** Everything the admin page shows, read with the service role. */
export async function fetchAdminOverview() {
  const db = serviceClient();
  const [crownRes, stateRes, paymentsRes, reportsRes, seasonsRes, configRes, logRes, heldRes] = await Promise.all([
    db.from("public_crown_state").select("*").single(),
    db.from("crown_state").select("current_reign_id, active_lock_id, active_lock_expires_at").single(),
    db
      .from("payments")
      .select("id, provider, provider_payment_id, amount_cents, currency, email, status, created_at")
      .order("created_at", { ascending: false })
      .limit(LIST_SIZE),
    db.from("reports").select("id, reign_id, reason, created_at").eq("resolved", false).order("created_at", { ascending: false }).limit(200),
    db.from("seasons").select("id, slug, name_en, starts_at, ends_at, closed_at, king_profile_id").order("id"),
    db.from("app_config").select("*").single(),
    db.from("admin_actions").select("id, admin_profile_id, action, target, created_at").order("id", { ascending: false }).limit(LIST_SIZE),
    db
      .from("reigns")
      .select("id, name, message, link, moderation_status, moderation_reason, moderation_attempts, started_at")
      .in("moderation_status", ["pending", "rejected"])
      // Pending first (they wait for a decision), then the newest rejections.
      .order("moderation_status", { ascending: true })
      .order("started_at", { ascending: false })
      .limit(LIST_SIZE),
  ]);
  const crown = must(crownRes, "crown");
  const state = must(stateRes, "crown state");
  const reports = must(reportsRes, "reports");

  const reignIds = [...new Set([...reports.map((r) => r.reign_id), ...(state.current_reign_id ? [state.current_reign_id] : [])])];
  const reigns = reignIds.length
    ? must(await db.from("reigns").select("id, profile_id, name, message, link, message_hidden, started_at").in("id", reignIds), "reigns")
    : [];
  const profileIds = [...new Set(reigns.map((r) => r.profile_id))];
  const profiles = profileIds.length
    ? must(await db.from("profiles").select("id, name, is_banned").in("id", profileIds), "profiles")
    : [];
  const lock = state.active_lock_id
    ? (await db.from("price_locks").select("id, name, email, price_cents, expires_at, status").eq("id", state.active_lock_id).maybeSingle()).data
    : null;

  const byReign = new Map<number, AdminReport>();
  for (const report of reports) {
    const reign = reigns.find((r) => r.id === report.reign_id);
    if (!reign) continue;
    const entry = byReign.get(reign.id) ?? {
      reignId: reign.id,
      name: reign.name,
      profileId: reign.profile_id,
      message: reign.message,
      link: reign.link,
      hidden: reign.message_hidden,
      banned: profiles.find((p) => p.id === reign.profile_id)?.is_banned ?? false,
      reports: [],
    };
    entry.reports.push({ id: report.id, reason: report.reason, createdAt: report.created_at });
    byReign.set(reign.id, entry);
  }

  const kingReign = reigns.find((r) => r.id === state.current_reign_id) ?? null;
  const adminIds = [...new Set((logRes.data ?? []).map((l) => l.admin_profile_id))];
  const adminNames = new Map(
    adminIds.length ? must(await db.from("profiles").select("id, name").in("id", adminIds), "admins").map((p) => [p.id, p.name]) : [],
  );

  return {
    crown: {
      seasonId: crown.season_id,
      priceCents: crown.price_cents ?? 0,
      king: kingReign ? { name: kingReign.name, startedAt: kingReign.started_at } : null,
      lock:
        lock && crown.is_locked
          ? { name: lock.name, email: lock.email, priceCents: lock.price_cents, expiresAt: lock.expires_at }
          : null,
    },
    payments: must(paymentsRes, "payments"),
    reports: [...byReign.values()].sort((a, b) => b.reports.length - a.reports.length),
    held: must(heldRes, "held content").map(
      (r): AdminHeld => ({
        reignId: r.id,
        name: r.name,
        message: r.message,
        link: r.link,
        status: r.moderation_status === "pending" ? "pending" : "rejected",
        reason: r.moderation_reason,
        attempts: r.moderation_attempts,
        startedAt: r.started_at,
      }),
    ),
    seasons: must(seasonsRes, "seasons"),
    reversals: await fetchReversals(db),
    refunds: must(
      await db
        .from("payments")
        .select("id, provider, provider_payment_id, amount_cents, currency, email, created_at, refund_attempts, refund_next_attempt_at, refund_last_error, refund_requested_at")
        .eq("status", "refund_pending")
        .order("created_at"),
      "pending refunds",
    ),
    config: must(configRes, "config"),
    log: (logRes.data ?? []).map((l) => ({ ...l, adminName: adminNames.get(l.admin_profile_id) ?? l.admin_profile_id })),
  };
}

export type AdminOverview = Awaited<ReturnType<typeof fetchAdminOverview>>;

/** Reigns reversed after delivery (refund or chargeback), newest first. */
async function fetchReversals(db: ReturnType<typeof serviceClient>) {
  const reigns = must(
    await db
      .from("reigns")
      .select("id, profile_id, name, season_id, price_paid_cents, reversal_kind, reversed_at, payment_id")
      .not("reversed_at", "is", null)
      .order("reversed_at", { ascending: false })
      .limit(50),
    "reversed reigns",
  );
  const [paymentsRes, profilesRes] = await Promise.all([
    db.from("payments").select("id, provider, provider_payment_id, dispute_status").in("id", reigns.flatMap((r) => (r.payment_id ? [r.payment_id] : []))),
    db.from("profiles").select("id, is_banned").in("id", reigns.map((r) => r.profile_id)),
  ]);
  const payments = new Map(must(paymentsRes, "payments").map((p) => [p.id, p]));
  const banned = new Map(must(profilesRes, "profiles").map((p) => [p.id, p.is_banned]));
  return reigns.map((r) => {
    const payment = r.payment_id ? payments.get(r.payment_id) : undefined;
    return {
      reignId: r.id,
      profileId: r.profile_id,
      name: r.name,
      seasonId: r.season_id,
      priceCents: r.price_paid_cents,
      kind: r.reversal_kind === "chargeback" ? ("chargeback" as const) : ("refund" as const),
      reversedAt: r.reversed_at!,
      provider: payment?.provider ?? null,
      providerPaymentId: payment?.provider_payment_id ?? null,
      disputeStatus: payment?.dispute_status ?? null,
      banned: banned.get(r.profile_id) ?? false,
    };
  });
}

export type LaunchPlan = {
  startsAt: string;
  /** Genesis had to be made longer to last the minimum number of days. */
  extended: boolean;
  rows: { season_id: number; starts_at: string; ends_at: string }[];
};

/** The season dates launch_game would set for a launch at `startsAt` (an ISO time), or null. */
export async function fetchLaunchPlan(startsAt: unknown): Promise<LaunchPlan | null> {
  if (typeof startsAt !== "string" || Number.isNaN(Date.parse(startsAt))) return null;
  const db = serviceClient();
  const [planRes, genesisRes] = await Promise.all([
    db.rpc("launch_plan", { p_starts_at: new Date(startsAt).toISOString() }),
    db.from("seasons").select("ends_at").eq("id", 0).single(),
  ]);
  if (planRes.error || !planRes.data?.length || !genesisRes.data) return null;
  const rows = planRes.data;
  return {
    startsAt: new Date(startsAt).toISOString(),
    extended: Date.parse(rows[0].ends_at) > Date.parse(genesisRes.data.ends_at),
    rows,
  };
}
