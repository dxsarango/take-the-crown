import { z } from "zod";
import { clientIp, hashIp } from "@/lib/security/request";
import { serviceClient } from "@/lib/supabase/service";

const schema = z.object({
  reignId: z.number().int().positive(),
  reason: z.enum(["offensive", "spam", "scam", "impersonation", "other"]).optional(),
});

/** Reports a reign's message: one per IP per reign; a repeat answers the same as the first. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const { data, error } = await serviceClient().rpc("report_reign", {
    p_reign_id: parsed.data.reignId,
    p_ip_hash: hashIp(clientIp(request.headers)),
    p_reason: parsed.data.reason ?? (null as unknown as string),
  });
  if (error) {
    console.error("report failed", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  if (data === "not_found") return Response.json({ ok: false }, { status: 404 });
  return Response.json({ ok: true });
}
