import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Checkout, CheckoutInput, NormalizedEvent, PaymentProvider } from "./types";

/**
 * Local and e2e stand-in for a real merchant of record. Checkout happens in an overlay inside the
 * payment modal; "paying" posts a signed webhook to our own webhook route, exactly like a real
 * provider would.
 */

export const TEST_SIGNATURE_HEADER = "x-test-signature";

const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("payment_succeeded"),
    eventId: z.string().min(1),
    providerPaymentId: z.string().min(1),
    lockId: z.uuid(),
    amountCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    email: z.email(),
  }),
  z.object({ type: z.literal("refund_succeeded"), eventId: z.string().min(1), providerPaymentId: z.string().min(1) }),
]);

export type TestEvent = z.infer<typeof eventSchema>;

export function signTestPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export class TestProvider implements PaymentProvider {
  readonly name = "test";

  constructor(
    private readonly secret: string,
    private readonly siteUrl: string,
  ) {}

  async createCheckout(input: CheckoutInput): Promise<Checkout> {
    return { checkoutId: `test_chk_${randomUUID()}`, url: `${this.siteUrl}/?test-checkout=${input.lockId}`, mode: "overlay" };
  }

  async verifyWebhook(req: Request): Promise<NormalizedEvent | null> {
    const body = await req.text();
    const signature = req.headers.get(TEST_SIGNATURE_HEADER) ?? "";
    const expected = signTestPayload(body, this.secret);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return null;
    }
    const parsed = eventSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  }

  async refund(providerPaymentId: string): Promise<void> {
    // A real provider confirms refunds asynchronously through a webhook; so does this one.
    await this.send({ type: "refund_succeeded", eventId: `evt_${randomUUID()}`, providerPaymentId });
  }

  /** Simulates the buyer completing checkout: the provider notifies our webhook. */
  async pay(input: { lockId: string; amountCents: number; email: string }): Promise<void> {
    await this.send({
      type: "payment_succeeded",
      eventId: `evt_${randomUUID()}`,
      providerPaymentId: `test_pay_${randomUUID()}`,
      lockId: input.lockId,
      amountCents: input.amountCents,
      currency: "USD",
      email: input.email,
    });
  }

  private async send(event: TestEvent): Promise<void> {
    const body = JSON.stringify(event);
    const response = await fetch(`${this.siteUrl}/api/webhooks/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [TEST_SIGNATURE_HEADER]: signTestPayload(body, this.secret) },
      body,
    });
    if (!response.ok) throw new Error(`Test webhook failed with ${response.status}`);
  }
}
