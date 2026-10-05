import "server-only";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/service";
import { verifyWebhookSignature } from "./standard-webhooks";
import { type Checkout, type CheckoutInput, DISPUTE_STATUSES, type DisputeStatus, type NormalizedEvent, type PaymentProvider } from "./types";

/**
 * Dodo Payments, merchant of record (SPEC §10). One one-time product with Pay What You Want on:
 * each checkout session charges exactly the locked price (`product_cart[].amount`, cents), and the
 * product's own price is the minimum Dodo accepts. Checkout is Dodo's hosted page (redirect).
 */

export type DodoConfig = { mode: "test" | "live"; apiKey: string; webhookSecret: string; productId: string };

const BASE_URL = { test: "https://test.dodopayments.com", live: "https://live.dodopayments.com" } as const;

const checkoutAnswer = z.object({ session_id: z.string().min(1), checkout_url: z.url() });

const productAnswer = z.object({
  price: z.object({ type: z.string(), price: z.number().int(), pay_what_you_want: z.boolean().optional() }),
});

const envelope = z.object({ type: z.string(), data: z.record(z.string(), z.unknown()) });

const paymentData = z.object({
  payment_id: z.string().min(1),
  total_amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  customer: z.object({ email: z.string() }),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  checkout_session_id: z.string().nullish(),
});

const refundData = z.object({ payment_id: z.string().min(1) });

const disputeData = z.object({ payment_id: z.string().min(1) });

/** A Dodo webhook body mapped to our events; the lock comes from metadata or the checkout session. */
export type DodoEvent =
  | { type: "payment_succeeded"; providerPaymentId: string; lockId: string | null; checkoutId: string | null; amountCents: number; currency: string; email: string }
  | { type: "refund_succeeded"; providerPaymentId: string }
  | { type: "dispute"; providerPaymentId: string; status: DisputeStatus }
  | { type: "ignored" };

export function mapDodoEvent(json: unknown): DodoEvent | null {
  const parsed = envelope.safeParse(json);
  if (!parsed.success) return null;
  const { type, data } = parsed.data;
  if (type === "payment.succeeded") {
    const payment = paymentData.safeParse(data);
    if (!payment.success) return null;
    const lockId = z.uuid().safeParse(payment.data.metadata?.lock_id);
    return {
      type: "payment_succeeded",
      providerPaymentId: payment.data.payment_id,
      lockId: lockId.success ? lockId.data : null,
      checkoutId: payment.data.checkout_session_id ?? null,
      amountCents: payment.data.total_amount,
      currency: payment.data.currency.toUpperCase(),
      email: payment.data.customer.email,
    };
  }
  if (type === "refund.succeeded") {
    const refund = refundData.safeParse(data);
    return refund.success ? { type: "refund_succeeded", providerPaymentId: refund.data.payment_id } : null;
  }
  // dispute.opened … dispute.lost: the event name carries the status (Dodo's dispute_status values).
  const disputeStatus = /^dispute.([a-z]+)$/.exec(type)?.[1];
  if (disputeStatus) {
    const status = DISPUTE_STATUSES.find((s) => s === `dispute_${disputeStatus}`);
    const dispute = disputeData.safeParse(data);
    if (!status || !dispute.success) return null;
    return { type: "dispute", providerPaymentId: dispute.data.payment_id, status };
  }
  return { type: "ignored" };
}

export class DodoProvider implements PaymentProvider {
  readonly name = "dodo";

  constructor(private readonly config: DodoConfig) {}

  get mode(): "test" | "live" {
    return this.config.mode;
  }

  private async call(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<unknown> {
    const response = await fetch(`${BASE_URL[this.config.mode]}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Dodo ${init.method} ${path} answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.json();
  }

  async createCheckout(input: CheckoutInput): Promise<Checkout> {
    const answer = checkoutAnswer.parse(
      await this.call("/checkouts", {
        method: "POST",
        body: {
          product_cart: [{ product_id: this.config.productId, quantity: 1, amount: input.priceCents }],
          customer: { email: input.email },
          billing_currency: "USD",
          return_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: { lock_id: input.lockId },
        },
      }),
    );
    return { checkoutId: answer.session_id, url: answer.checkout_url, mode: "redirect" };
  }

  async verifyWebhook(req: Request): Promise<NormalizedEvent | null> {
    const body = await req.text();
    const id = req.headers.get("webhook-id");
    const valid = verifyWebhookSignature(
      this.config.webhookSecret,
      { id, timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") },
      body,
    );
    if (!valid || !id) return null;
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return null;
    }
    const event = mapDodoEvent(json);
    if (!event) return null;
    if (event.type === "ignored") return { type: "ignored", eventId: id };
    if (event.type === "refund_succeeded" || event.type === "dispute") return { ...event, eventId: id };

    // Metadata carries the lock; the checkout session we stored on the lock is the fallback.
    const lockId = event.lockId ?? (event.checkoutId ? await lockForCheckout(event.checkoutId) : null);
    if (!lockId) {
      // Only our checkouts sell the product, so this needs a person: the payment shows in Dodo.
      console.error("dodo payment without a lock", event.providerPaymentId);
      return { type: "ignored", eventId: id };
    }
    return {
      type: "payment_succeeded",
      eventId: id,
      providerPaymentId: event.providerPaymentId,
      lockId,
      amountCents: event.amountCents,
      currency: event.currency,
      email: event.email,
    };
  }

  async refund(providerPaymentId: string): Promise<void> {
    await this.call("/refunds", {
      method: "POST",
      body: { payment_id: providerPaymentId, reason: "The crown could not be delivered for this payment." },
    });
  }

  /** The product's Pay What You Want minimum, in cents: the floor price may never go below it. */
  async minimumCents(): Promise<number> {
    const product = productAnswer.parse(await this.call(`/products/${encodeURIComponent(this.config.productId)}`, { method: "GET" }));
    return product.price.price;
  }
}

async function lockForCheckout(checkoutId: string): Promise<string | null> {
  const { data } = await serviceClient().from("price_locks").select("id").eq("checkout_id", checkoutId).maybeSingle();
  return data?.id ?? null;
}
