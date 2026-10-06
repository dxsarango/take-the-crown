import "server-only";
import { sendMagicLink } from "@/lib/auth/magic-link";
import { hashIp } from "@/lib/security/request";
import { withinHourlyLimit } from "@/lib/security/rate-limit";

/**
 * Asks for a fresh sign-in before a sensitive action: emails a sign-in link that brings the player
 * back to `next`, within the hourly sign-in link limit for the address.
 */
export async function emailReauthLink(email: string, next: string): Promise<void> {
  if (await withinHourlyLimit(`magic_link_email:${hashIp(email.toLowerCase())}`, "max_magic_links_per_hour")) {
    await sendMagicLink(email, next);
  }
}

/** Whether `at` lies within the last `seconds`. */
export function within(at: string | null, seconds: number, now = Date.now()): boolean {
  return at !== null && now - Date.parse(at) < seconds * 1000;
}
