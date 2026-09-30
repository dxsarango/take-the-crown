import { processOutbox } from "@/lib/email/outbox";
import { cronAuthorized } from "@/lib/security/cron";

/** Retries the email outbox every minute (Vercel cron, bearer CRON_SECRET). */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers)) return Response.json({ ok: false }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await processOutbox()) });
  } catch (e) {
    console.error("outbox run failed", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
