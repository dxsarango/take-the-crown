import { processRefunds } from "@/lib/payments/refunds";
import { cronAuthorized } from "@/lib/security/cron";

/** Retries refunds the provider refused, with backoff (Vercel cron, bearer CRON_SECRET). */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers)) return Response.json({ ok: false }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await processRefunds()) });
  } catch (e) {
    console.error("refund run failed", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
