import { createHash, randomBytes } from "node:crypto";

/** A random id that tells this browser apart from others, so a visitor without an account hails a reign once. */
export const HAILER_COOKIE = "hailer";
const HAILER_COOKIE_SECONDS = 400 * 24 * 3600;
const HAILER_ID = /^[0-9a-f]{32}$/;

export const HAIL_STATUSES = ["created", "duplicate", "own_reign", "ip_limit", "not_current"] as const;
export type HailStatus = (typeof HAIL_STATUSES)[number];

export function newHailerId(): string {
  return randomBytes(16).toString("hex");
}

/** The browser's hailer id from a `Cookie` header, or null when it has none (or a malformed one). */
export function readHailerId(cookieHeader: string | null): string | null {
  const match = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${HAILER_COOKIE}=`));
  const value = match?.slice(HAILER_COOKIE.length + 1) ?? "";
  return HAILER_ID.test(value) ? value : null;
}

export function hailerCookie(id: string, https: boolean): string {
  return `${HAILER_COOKIE}=${id}; Max-Age=${HAILER_COOKIE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${https ? "; Secure" : ""}`;
}

/** Who a hail counts for: the account when signed in, else the browser (stored hashed). */
export function hailerKey(profileId: string | null, hailerId: string): string {
  return profileId ? `p:${profileId}` : `d:${createHash("sha256").update(hailerId).digest("hex")}`;
}
