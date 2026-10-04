import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Standard Webhooks signature check, as Dodo Payments signs its webhooks:
 * HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}` with the secret (`whsec_` prefix
 * removed, base64-decoded), sent as space-separated `v1,<base64>` values in `webhook-signature`.
 */

export const TOLERANCE_SECONDS = 5 * 60;

export type WebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null };

function signingKey(secret: string): Buffer {
  return Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
}

export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  return createHmac("sha256", signingKey(secret)).update(`${id}.${timestamp}.${body}`).digest("base64");
}

/** True when one of the `v1` signatures matches and the timestamp is within five minutes of `now`. */
export function verifyWebhookSignature(secret: string, headers: WebhookHeaders, body: string, now = Date.now()): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signWebhook(secret, id, Number(timestamp), body));
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
