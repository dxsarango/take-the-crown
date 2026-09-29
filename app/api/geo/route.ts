import { requestCountry } from "@/lib/security/request";

/** Country detected from the request (Cloudflare), to preselect it in the payment modal. */
export function GET(request: Request) {
  return Response.json({ country: requestCountry(request.headers) }, { headers: { "Cache-Control": "no-store" } });
}
