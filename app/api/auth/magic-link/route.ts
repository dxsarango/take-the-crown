import { z } from "zod";
import { sendMagicLink } from "@/lib/auth/magic-link";
import { safeNext } from "@/lib/auth/next";
import { withinHourlyLimit } from "@/lib/security/rate-limit";
import { clientIp, hashIp, sameOrigin } from "@/lib/security/request";

const schema = z.object({
  email: z.email().max(254),
  next: z.string().max(512).optional(),
});

/**
 * Emails a sign-in link. The answer is the same whether or not the address has an account. Limited
 * per IP and per address, so nobody can flood an inbox or spend the project's email quota.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ ok: false }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
  const email = parsed.data.email.trim();
  const ip = hashIp(clientIp(request.headers));
  if (
    !(await withinHourlyLimit(`magic_link_ip:${ip}`, "max_magic_links_per_hour")) ||
    !(await withinHourlyLimit(`magic_link_email:${hashIp(email.toLowerCase())}`, "max_magic_links_per_hour"))
  ) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  await sendMagicLink(email, safeNext(parsed.data.next));
  return Response.json({ ok: true });
}
