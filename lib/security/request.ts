import "server-only";
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

/** Client IP as seen through Cloudflare / Vercel, or a placeholder in local development. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** IPs are only ever stored as salted SHA-256 hashes (SPEC §11). */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${serverEnv().IP_HASH_SALT}:${ip}`).digest("hex");
}

/** ISO country from Cloudflare, when present and valid. */
export function requestCountry(headers: Headers): string | null {
  const code = headers.get("cf-ipcountry")?.toUpperCase() ?? null;
  return code && /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : null;
}
