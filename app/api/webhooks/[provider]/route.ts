import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processOutbox } from "@/lib/email/outbox";
import { providerByName } from "@/lib/payments";
import { serviceClient } from "@/lib/supabase/service";

/**
 * Payment webhooks. The signature is always verified; the database decides whether a payment
 * crowns the buyer or must be refunded, and is idempotent per event and per payment.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/webhooks/[provider]">) {
  const provider = providerByName((await params).provider);
  if (!provider) return new Response(null, { status: 404 });

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
      });
      // A failure here makes the provider retry the webhook.
      if (error) {
        console.error("record_paid_payment failed", error.message);
        return new Response(null, { status: 500 });
      }
      if (result === "refund_pending") {
        await provider.refund(event.providerPaymentId).catch((e: unknown) => {
          // Stays refund_pending; the admin refund action (M7) picks it up.
          console.error("refund failed", event.providerPaymentId, e);
        });
      }
      if (result === "applied") {
        revalidatePath("/[locale]", "page");
        // The dethroned alert goes out right after the takeover; the cron retries what fails.
        after(() => processOutbox().catch((e: unknown) => console.error("outbox after webhook failed", e)));
      }
      return Response.json({ result });
    }
    case "refund_succeeded": {
      const { error } = await db.rpc("mark_payment_refunded", {
        p_provider: provider.name,
        p_provider_payment_id: event.providerPaymentId,
      });
      if (error) return new Response(null, { status: 500 });
      return Response.json({ result: "refunded" });
    }
    case "ignored":
      return Response.json({ result: "ignored" });
  }
}
