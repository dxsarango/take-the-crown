import { z } from "zod";
import { REPORT_REASONS } from "@/lib/reports";
import { withinHourlyLimit } from "@/lib/security/rate-limit";
import { clientIp, hashIp, sameOrigin } from "@/lib/security/request";
import { serviceClient } from "@/lib/supabase/service";

const schema = z.object({
  reignId: z.number().int().positive(),
  reason: z.enum(REPORT_REASONS),
});

/**
 * Reports a reign's message: one per IP per reign; a repeat answers the same as the first. Reports
 * never hide anything by themselves; the third one alerts the admins (decision 32).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ ok: false }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const ipHash = hashIp(clientIp(request.headers));
  if (!(await withinHourlyLimit(`report:${ipHash}`, "max_reports_per_ip_per_hour"))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const { data, error } = await serviceClient().rpc("report_reign", {
    p_reign_id: parsed.data.reignId,
    p_ip_hash: ipHash,
    p_reason: parsed.data.reason,
  });
  if (error) {
    console.error("report failed", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  if (data === "not_found") return Response.json({ ok: false }, { status: 404 });
  return Response.json({ ok: true });
}
