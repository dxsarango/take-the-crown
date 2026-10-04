/** Provider-agnostic payment interface (SPEC §10). */

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
  | { type: "ignored"; eventId: string };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<Checkout>;
  /** Returns null when the signature or payload is invalid. */
  verifyWebhook(req: Request): Promise<NormalizedEvent | null>;
  refund(providerPaymentId: string): Promise<void>;
}
