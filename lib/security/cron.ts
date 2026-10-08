import "server-only";
import { serverEnv } from "@/lib/env.server";
import { bearerMatches } from "./bearer";

/** Vercel cron calls carry `Authorization: Bearer <CRON_SECRET>`. Without a secret, nothing passes. */
export function cronAuthorized(headers: Headers): boolean {
  return bearerMatches(headers.get("authorization"), serverEnv().CRON_SECRET);
}
