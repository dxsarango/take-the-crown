import { z } from "zod";
import { testProvider } from "@/lib/payments";
import { serviceClient } from "@/lib/supabase/service";

const bodySchema = z.object({ lockId: z.uuid() });

/** Test checkout "Pay" button: the test provider charges the locked price and calls our webhook. */
export async function POST(request: Request) {
  const provider = testProvider();
  if (!provider) return new Response(null, { status: 404 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response(null, { status: 400 });

  const { data: lock } = await serviceClient()
    .from("price_locks")
    .select("id, price_cents, email")
    .eq("id", body.data.lockId)
    .maybeSingle();
  if (!lock) return new Response(null, { status: 404 });

  await provider.pay({ lockId: lock.id, amountCents: lock.price_cents, email: lock.email });
  return new Response(null, { status: 204 });
}
