import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

/**
 * Whether the request came through our Cloudflare zone: a Transform Rule there adds
 * `x-origin-secret`. Anyone can send Cloudflare's own headers straight to Vercel, so they count
 * only with the secret.
 */
function viaCloudflare(headers: Headers): boolean {
  const secret = serverEnv().CLOUDFLARE_ORIGIN_SECRET;
  const given = headers.get("x-origin-secret");
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Client IP for limits and report dedupe: Cloudflare's when the request provably came through it,
 * else Vercel's (which Vercel sets itself), or a placeholder in local development.
 */
export function clientIp(headers: Headers): string {
  const cloudflare = viaCloudflare(headers) ? headers.get("cf-connecting-ip") : null;
  return cloudflare ?? headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** IPs are only ever stored as salted SHA-256 hashes (SPEC §11). */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${serverEnv().IP_HASH_SALT}:${ip}`).digest("hex");
}

/**
 * Browsers send Origin on cross-site POST, PATCH and DELETE requests. Cookie-authenticated API
 * routes refuse other origins, on top of SameSite=Lax cookies. A request without Origin is not
 * from a cross-site page, so it is left to the route's own checks.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    const from = new URL(origin);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return from.host === host || from.origin === new URL(serverEnv().NEXT_PUBLIC_SITE_URL).origin;
  } catch {
    return false;
  }
}

/** ISO country from Cloudflare or Vercel, when present and valid; only a suggestion for the form. */
export function requestCountry(headers: Headers): string | null {
  const code = ((viaCloudflare(headers) ? headers.get("cf-ipcountry") : null) ?? headers.get("x-vercel-ip-country"))?.toUpperCase() ?? null;
  return code && /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : null;
}
