import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";

export const ALERT_KINDS = ["dethroned", "price_drop", "season_started"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

function secret(): string {
  const value = serverEnv().EMAIL_LINK_SECRET;
  if (!value) throw new Error("EMAIL_LINK_SECRET is not set");
  return value;
}

function signature(profileId: string, kind: AlertKind): string {
  return createHmac("sha256", secret()).update(`alert-off:${profileId}:${kind}`).digest("base64url");
}

/** A token for one player's "turn off this alert" link. It never expires: the action is harmless. */
export function alertOffToken(profileId: string, kind: AlertKind): string {
  return `${profileId}.${kind}.${signature(profileId, kind)}`;
}

const tokenShape = z.tuple([z.uuid(), z.enum(ALERT_KINDS), z.string().min(1)]);

export function readAlertOffToken(token: string): { profileId: string; kind: AlertKind } | null {
  const parsed = tokenShape.safeParse(token.split("."));
  if (!parsed.success) return null;
  const [profileId, kind, given] = parsed.data;
  const expected = Buffer.from(signature(profileId, kind));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? { profileId, kind } : null;
}
