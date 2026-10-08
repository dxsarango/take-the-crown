import { timingSafeEqual } from "node:crypto";

/** Whether an `Authorization` header is exactly `Bearer <secret>`. Without a secret, nothing passes. */
export function bearerMatches(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = Buffer.from(authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
