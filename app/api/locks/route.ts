import { createLock } from "@/lib/locks/create";
import { clientIp, sameOrigin } from "@/lib/security/request";

const STATUS: Record<string, number> = {
  invalid_input: 400,
  moderation_rejected: 422,
  human_check_failed: 403,
  crown_locked: 409,
  already_king: 409,
  season_closed: 409,
  name_taken: 409,
  rate_limited: 429,
  banned: 403,
  prelaunch: 403,
  paused: 503,
  checkout_failed: 502,
  unknown: 500,
};

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ ok: false, error: "invalid_input" }, { status: 403 });
  const body: unknown = await request.json().catch(() => null);
  const outcome = await createLock(body, clientIp(request.headers));
  const status = outcome.ok ? 200 : (STATUS[outcome.error] ?? 400);
  return Response.json(outcome, { status, headers: { "Cache-Control": "no-store" } });
}
