import { revalidatePath } from "next/cache";
import { cronAuthorized } from "@/lib/security/cron";
import { moderate } from "@/lib/moderation";
import { serviceClient } from "@/lib/supabase/service";

/** Pending reigns checked per run; the cron runs every minute. */
const BATCH = 20;

/**
 * Retries moderation for reigns whose message and link were quarantined because the model gave no
 * verdict at takeover (decision 31). Approved content becomes visible; rejected content stays hidden.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers)) return Response.json({ ok: false }, { status: 401 });

  const db = serviceClient();
  const { data: pending, error } = await db
    .from("reigns")
    .select("id, name, message, link")
    .eq("moderation_status", "pending")
    .order("started_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    console.error("pending moderation query failed", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }

  const counts = { approved: 0, rejected: 0, pending: 0 };
  for (const reign of pending) {
    const verdict = await moderate({ name: reign.name, message: reign.message, link: reign.link }, { retry: true });
    if (verdict.verdict === "unavailable") {
      await db.rpc("note_moderation_attempt", { p_reign_id: reign.id });
      counts.pending += 1;
      continue;
    }
    const approved = verdict.verdict === "allow";
    const { error: settleError } = await db.rpc("settle_reign_moderation", {
      p_reign_id: reign.id,
      p_approved: approved,
      p_reason: approved ? (null as unknown as string) : verdict.reason,
    });
    if (settleError) {
      console.error("settle_reign_moderation failed", settleError.message);
      continue;
    }
    counts[approved ? "approved" : "rejected"] += 1;
  }

  if (counts.approved > 0) revalidatePath("/[locale]", "page");
  return Response.json({ ok: true, ...counts });
}
