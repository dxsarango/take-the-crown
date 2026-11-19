import { z } from "zod";
import { currentViewer } from "@/lib/auth/viewer";
import { HAIL_STATUSES, hailerCookie, hailerKey, newHailerId, readHailerId } from "@/lib/hail";
import { verifyHuman } from "@/lib/security/human";
import { withinHourlyLimit } from "@/lib/security/rate-limit";
import { clientIp, hashIp, sameOrigin } from "@/lib/security/request";
import { serviceClient } from "@/lib/supabase/service";

const schema = z.object({
  reignId: z.number().int().positive(),
  turnstileToken: z.string().max(4096).nullish(),
});

const answer = z.object({ status: z.enum(HAIL_STATUSES), hails: z.number().int().nonnegative() });

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Hails the current king: free, open to visitors without an account (one per browser and reign,
 * a few per address), once per account and reign for signed-in players. A repeat answers
 * `duplicate` with the count, so the page can show the same state either way.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ ok: false }, { status: 403, headers: NO_STORE });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400, headers: NO_STORE });

  const ip = clientIp(request.headers);
  const ipHash = hashIp(ip);
  if (!(await withinHourlyLimit(`hail:${ipHash}`, "max_hails_per_ip_per_hour"))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  if (!(await verifyHuman(parsed.data.turnstileToken, ip, "hail"))) {
    return Response.json({ ok: false, error: "human_check_failed" }, { status: 403, headers: NO_STORE });
  }

  const viewer = await currentViewer();
  const known = readHailerId(request.headers.get("cookie"));
  const hailerId = known ?? newHailerId();
  const { data, error } = await serviceClient().rpc("hail_reign", {
    p_reign_id: parsed.data.reignId,
    p_hailer_key: hailerKey(viewer?.profileId ?? null, hailerId),
    p_ip_hash: ipHash,
    p_profile_id: viewer?.profileId,
  });
  const result = answer.safeParse(data);
  if (error || !result.success) {
    console.error("hail failed", error?.message);
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE });
  }

  const headers = new Headers(NO_STORE);
  if (!known) headers.append("Set-Cookie", hailerCookie(hailerId, new URL(request.url).protocol === "https:"));
  const { status, hails } = result.data;
  if (status === "ip_limit") return Response.json({ ok: false, error: status, hails }, { status: 429, headers });
  if (status === "not_current") return Response.json({ ok: false, error: status, hails }, { status: 409, headers });
  return Response.json({ ok: true, status, hails }, { headers });
}
