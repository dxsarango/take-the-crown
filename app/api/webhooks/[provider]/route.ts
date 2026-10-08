import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { after } from "next/server";
import { isDeployed } from "@/lib/config/deployment";
import { processOutbox } from "@/lib/email/outbox";
import { providerByName } from "@/lib/payments";
import { paymentIdFor, requestRefund } from "@/lib/payments/refunds";
import { serviceClient } from "@/lib/supabase/service";
import { revalidateHome } from "@/lib/home/cache";
import { errorText } from "@/lib/security/redact";

/**
 * Local only: keeps each raw provider webhook with its signature headers, as test fixtures
 * (tests/fixtures/dodo/README.md) and so the Dodo e2e can deliver one again as a duplicate.
 */
async function recordWebhook(request: Request): Promise<void> {
  const body = await request.text();
  const type = /"type"\s*:\s*"([a-z._]+)"/.exec(body)?.[1] ?? "unknown";
  const headers = Object.fromEntries(["webhook-id", "webhook-timestamp", "webhook-signature"].map((h) => [h, request.headers.get(h)]));
  const dir = path.join(process.cwd(), "tests", "fixtures", "dodo", "recorded");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${type}-${Date.now()}.json`), JSON.stringify({ headers, body }, null, 2));
}

/**
 * Payment webhooks. The signature is always verified; the database decides whether a payment
 * crowns the buyer or must be refunded, and is idempotent per event and per payment.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/webhooks/[provider]">) {
  const provider = await providerByName((await params).provider).catch(() => null);
  if (!provider) return new Response(null, { status: 404 });

  if (process.env.DODO_RECORD_WEBHOOKS === "1" && !isDeployed()) await recordWebhook(request.clone());
  const event = await provider.verifyWebhook(request);
  if (!event) return new Response(null, { status: 401 });

  const db = serviceClient();
  switch (event.type) {
    case "payment_succeeded": {
      const { data: result, error } = await db.rpc("record_paid_payment", {
        p_provider: provider.name,
        p_event_id: event.eventId,
        p_provider_payment_id: event.providerPaymentId,
        p_lock_id: event.lockId,
        p_amount_cents: event.amountCents,
        p_currency: event.currency,
        p_email: event.email,
        p_live: provider.live,
      });
      // A failure here makes the provider retry the webhook.
      if (error) {
        console.error("record_paid_payment failed", error.message);
        return new Response(null, { status: 500 });
      }
      if (result === "refund_pending") {
        // A refused request stays refund_pending and the refunds cron retries it.
        const paymentId = await paymentIdFor(provider.name, event.providerPaymentId);
        if (paymentId) await requestRefund(paymentId).catch((e: unknown) => console.error("refund request failed", paymentId, errorText(e)));
      }
      if (result === "applied") {
        revalidateHome();
        // The dethroned alert goes out right after the takeover; the cron retries what fails.
        after(() => processOutbox().catch((e: unknown) => console.error("outbox after webhook failed", errorText(e))));
      }
      return Response.json({ result });
    }
    case "refund_succeeded": {
      const { error } = await db.rpc("mark_payment_refunded", {
        p_provider: provider.name,
        p_provider_payment_id: event.providerPaymentId,
      });
      if (error) return new Response(null, { status: 500 });
      // A refund of a delivered crown reverses its reign (mark_payment_refunded), which the home shows.
      revalidateHome();
      return Response.json({ result: "refunded" });
    }
    case "dispute": {
      const { data: result, error } = await db.rpc("record_payment_dispute", {
        p_provider: provider.name,
        p_provider_payment_id: event.providerPaymentId,
        p_status: event.status,
      });
      if (error) {
        console.error("record_payment_dispute failed", error.message);
        return new Response(null, { status: 500 });
      }
      if (result === "unknown_payment") console.error("dispute for an unknown payment", event.providerPaymentId);
      if (result === "reversed") revalidateHome();
      return Response.json({ result });
    }
    case "ignored":
      return Response.json({ result: "ignored" });
  }
}
