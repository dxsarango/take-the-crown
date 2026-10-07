import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

/** Whether Cloudflare's headers can be trusted for this request, or why not. */
export type CloudflareTrust = "trusted" | "not_configured" | "no_secret_header" | "wrong_secret";

/**
 * Whether the request came through our Cloudflare zone: a Transform Rule there adds
 * `x-origin-secret`. Anyone can send Cloudflare's own headers straight to Vercel, so they count
 * only with the secret.
 */
function cloudflareTrust(headers: Headers): CloudflareTrust {
  const secret = serverEnv().CLOUDFLARE_ORIGIN_SECRET;
  if (!secret) return "not_configured";
  const given = headers.get("x-origin-secret");
  if (!given) return "no_secret_header";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b) ? "trusted" : "wrong_secret";
}

function viaCloudflare(headers: Headers): boolean {
  return cloudflareTrust(headers) === "trusted";
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

function validCountry(value: string | null): string | null {
  const code = value?.toUpperCase() ?? null;
  return code && /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : null;
}

export type DetectedCountry = { country: string | null; source: "cloudflare" | "vercel" | null; cloudflare: CloudflareTrust };

/**
 * The visitor's country and where it came from. Behind the Cloudflare proxy, Vercel geolocates
 * Cloudflare's edge (a Miami edge reads as US for a visitor in Ecuador), so Cloudflare's
 * cf-ipcountry comes first, when the origin secret proves the request came through our zone.
 * Otherwise, or when Cloudflare has no country, Vercel's geolocation.
 */
export function detectCountry(headers: Headers): DetectedCountry {
  const cloudflare = cloudflareTrust(headers);
  const fromCloudflare = cloudflare === "trusted" ? validCountry(headers.get("cf-ipcountry")) : null;
  if (fromCloudflare) return { country: fromCloudflare, source: "cloudflare", cloudflare };
  const fromVercel = validCountry(headers.get("x-vercel-ip-country"));
  return { country: fromVercel, source: fromVercel ? "vercel" : null, cloudflare };
}

/** ISO country, when present and valid; only a suggestion for the form. */
export function requestCountry(headers: Headers): string | null {
  return detectCountry(headers).country;
}
