import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { paymentProvider } from "./index";
import { type PaymentProvider, RefundError } from "./types";

type Db = ReturnType<typeof serviceClient>;
type Claimed = { id: string; provider: string; provider_payment_id: string };
export type RefundOutcome = "requested" | "retrying" | "stopped";

/**
 * Asks the provider to refund each claimed payment and records the answer. A refusal that may clear
 * up (Dodo's INSUFFICIENT_WALLET_FUNDS, rate limits, outages, unknown errors) keeps the backoff the
 * claim scheduled; one that can't (the payment is unknown, already refunded…) stops the retries
 * until an admin retries by hand.
 */
export async function attemptRefunds(db: Db, provider: PaymentProvider, claimed: Claimed[]): Promise<RefundOutcome[]> {
  const outcomes: RefundOutcome[] = [];
  for (const payment of claimed) {
    try {
      if (payment.provider !== provider.name) {
        throw new RefundError(`paid through ${payment.provider}, but payments now go through ${provider.name}`, false);
      }
      await provider.refund(payment.provider_payment_id);
      await db.rpc("record_refund_requested", { p_payment_id: payment.id });
      outcomes.push("requested");
    } catch (e) {
      const retry = !(e instanceof RefundError) || e.retry;
      const message = e instanceof Error ? e.message : String(e);
      console.error(`refund of ${payment.id} failed${retry ? ", will retry" : ""}:`, message);
      await db.rpc("record_refund_failed", { p_payment_id: payment.id, p_error: message, p_retry: retry });
      outcomes.push(retry ? "retrying" : "stopped");
    }
  }
  return outcomes;
}

/** Requests one payment's refund now: right after a webhook leaves it refund_pending, or an admin's retry. */
export async function requestRefund(paymentId: string): Promise<RefundOutcome | null> {
  const db = serviceClient();
  const { data, error } = await db.rpc("claim_refunds", { p_payment_id: paymentId });
  if (error) throw new Error(`claim_refunds failed: ${error.message}`);
  if (!data?.length) return null;
  const [outcome] = await attemptRefunds(db, await paymentProvider(), data);
  return outcome;
}

/** Our id for a provider's payment, for the webhook that only knows the provider's. */
export async function paymentIdFor(provider: string, providerPaymentId: string): Promise<string | null> {
  const { data } = await serviceClient().from("payments").select("id").eq("provider", provider).eq("provider_payment_id", providerPaymentId).maybeSingle();
  return data?.id ?? null;
}

/** Retries due refunds (cron). */
export async function processRefunds(limit = 10): Promise<Record<RefundOutcome, number>> {
  const db = serviceClient();
  const { data, error } = await db.rpc("claim_refunds", { p_limit: limit });
  if (error) throw new Error(`claim_refunds failed: ${error.message}`);
  const counts: Record<RefundOutcome, number> = { requested: 0, retrying: 0, stopped: 0 };
  if (!data?.length) return counts;
  for (const outcome of await attemptRefunds(db, await paymentProvider(), data)) counts[outcome] += 1;
  return counts;
}
