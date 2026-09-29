import "server-only";
import { serviceClient } from "@/lib/supabase/service";

export type LockStatus =
  | { status: "active"; expiresAt: string; priceCents: number }
  | { status: "applied" }
  | { status: "refunded" }
  | { status: "expired" }
  | { status: "not_found" };

/** Where a lock stands, for the buyer's modal while checkout is open. */
export async function lockStatus(lockId: string): Promise<LockStatus> {
  const db = serviceClient();
  const [{ data: lock }, { data: payments }] = await Promise.all([
    db.from("price_locks").select("status, expires_at, price_cents").eq("id", lockId).maybeSingle(),
    db.from("payments").select("status").eq("lock_id", lockId),
  ]);
  if (!lock) return { status: "not_found" };
  const statuses = (payments ?? []).map((p) => p.status);
  if (statuses.includes("applied")) return { status: "applied" };
  if (statuses.some((s) => s === "refund_pending" || s === "refunded")) return { status: "refunded" };
  if (lock.status === "active" && new Date(lock.expires_at).getTime() > Date.now()) {
    return { status: "active", expiresAt: lock.expires_at, priceCents: lock.price_cents };
  }
  return { status: "expired" };
}
