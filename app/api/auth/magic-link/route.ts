import { z } from "zod";
import { sendMagicLink } from "@/lib/auth/magic-link";
import { safeNext } from "@/lib/auth/next";

const schema = z.object({
  email: z.email().max(254),
  next: z.string().max(512).optional(),
});

/** Emails a sign-in link. The answer is the same whether or not the address has an account. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
  await sendMagicLink(parsed.data.email.trim(), safeNext(parsed.data.next));
  return Response.json({ ok: true });
}
