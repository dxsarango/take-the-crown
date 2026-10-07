import type { ModerationReason } from "@/lib/moderation/reasons";

/** What POST /api/locks answers; shared by the route and the payment modal. */

/** Errors raised by create_price_lock, each with its own UI state. */
export const LOCK_DB_ERRORS = [
  "crown_locked",
  "rate_limited",
  "already_king",
  "banned",
  "season_closed",
  "message_too_long",
  "name_invalid",
  "name_taken",
  "avatar_seed_invalid",
  "prelaunch",
  "paused",
] as const;

export type LockDbError = (typeof LOCK_DB_ERRORS)[number];

export type LockField = "name" | "email" | "link" | "message" | "country" | "acceptWithdrawal";

export type LockFailure =
  | { ok: false; error: LockDbError }
  | { ok: false; error: "invalid_input"; fields: LockField[] }
  | { ok: false; error: "moderation_rejected"; field: "link" | "message" | "name"; reason: ModerationReason }
  | { ok: false; error: "human_check_failed" }
  | { ok: false; error: "checkout_failed" }
  | { ok: false; error: "unknown" };

export type LockOutcome =
  | {
      ok: true;
      lockId: string;
      priceCents: number;
      expiresAt: string;
      checkout: { mode: "overlay" | "redirect"; url: string };
      /** The moderator had no verdict: the message and link appear after a review. */
      moderationPending: boolean;
    }
  /** The email belongs to a profile: a sign-in link was sent. Same answer for claimed and unclaimed profiles. */
  | { ok: true; verifyEmail: true }
  | LockFailure;

/** Maps a Postgres error message from create_price_lock to a UI state. */
export function lockErrorFromDb(message: string): LockDbError | "email_verification_required" | "invalid_link" | null {
  if (message === "email_verification_required") return message;
  if (message.includes("price_locks_link_format")) return "invalid_link";
  return LOCK_DB_ERRORS.find((code) => message === code) ?? null;
}
