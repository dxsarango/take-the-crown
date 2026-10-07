import { detectCountry } from "@/lib/security/request";

/**
 * Country detected from the request, to preselect it in the payment modal. The source and the
 * Cloudflare trust state (never the secret) are there for `pnpm check:deploy`.
 */
export function GET(request: Request) {
  return Response.json(detectCountry(request.headers), { headers: { "Cache-Control": "no-store" } });
}
