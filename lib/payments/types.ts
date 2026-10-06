/** Provider-agnostic payment interface (SPEC §10). */

export const DISPUTE_STATUSES = [
  "dispute_opened",
  "dispute_challenged",
  "dispute_accepted",
  "dispute_cancelled",
  "dispute_expired",
  "dispute_won",
  "dispute_lost",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export type CheckoutInput = {
  lockId: string;
  priceCents: number;
  email: string;
  locale: string;
  successUrl: string;
  /** Where the buyer lands after backing out of a redirect checkout. */
  cancelUrl: string;
};

export type Checkout = {
  checkoutId: string;
  url: string;
  /** "overlay" checkouts open inside the payment modal; "redirect" ones leave the page. */
  mode: "overlay" | "redirect";
};

export type NormalizedEvent =
  | {
      type: "payment_succeeded";
      eventId: string;
      providerPaymentId: string;
      lockId: string;
      amountCents: number;
      currency: string;
      email: string;
    }
  | { type: "refund_succeeded"; eventId: string; providerPaymentId: string }
  /** A chargeback's progress; opened, accepted and lost ones reverse the reign (record_payment_dispute). */
  | { type: "dispute"; eventId: string; providerPaymentId: string; status: DisputeStatus }
  | { type: "ignored"; eventId: string };

/** The provider refused a refund request; `retry` says whether asking again later can succeed. */
export class RefundError extends Error {
  constructor(
    message: string,
    readonly retry: boolean,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "RefundError";
  }
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<Checkout>;
  /** Returns null when the signature or payload is invalid. */
  verifyWebhook(req: Request): Promise<NormalizedEvent | null>;
  /** Asks for a refund; the provider confirms later with a refund webhook. Throws RefundError. */
  refund(providerPaymentId: string): Promise<void>;
}
