import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";
import type { HumanAction } from "./human-action";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const answer = z.object({
  success: z.boolean(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

/**
 * Cloudflare Turnstile check before anything a bot could abuse (a lock, a moderation call).
 * Without a secret key the check is skipped outside production (local development and e2e), and
 * fails in production. A token is single use and must have been issued for the same action.
 * Cloudflare being unreachable fails the check too: the buyer can try again.
 */
export async function verifyHuman(token: string | null | undefined, ip: string, action: HumanAction): Promise<boolean> {
  const secret = serverEnv().TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return true;
    console.error("TURNSTILE_SECRET_KEY is not set");
    return false;
  }
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);
  try {
    const response = await fetch(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const parsed = answer.safeParse(await response.json());
    if (!parsed.success) return false;
    if (!parsed.data.success) {
      console.warn("turnstile refused", parsed.data["error-codes"]?.join(","));
      return false;
    }
    // Cloudflare's test keys answer without an action.
    return !parsed.data.action || parsed.data.action === action;
  } catch (e) {
    console.error("turnstile unreachable", e);
    return false;
  }
}
