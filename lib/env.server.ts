import "server-only";
import { z } from "zod";

const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PAYMENT_PROVIDER: z.enum(["test"]),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  IP_HASH_SALT: z.string().min(16),
  NEXT_PUBLIC_SITE_URL: z.url(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  // "test" is a deterministic stand-in for local development and e2e; production uses "anthropic".
  MODERATION_PROVIDER: z.enum(["anthropic", "test"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  // "test" delivers to the local Mailpit (local development and e2e); production uses "resend".
  EMAIL_PROVIDER: z.enum(["resend", "test"]).default("resend"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  MAILPIT_URL: z.url().default("http://127.0.0.1:54324"),
  // Signs the "turn off alerts" links in emails.
  EMAIL_LINK_SECRET: z.string().min(32).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

/** Server secrets, validated on first use so builds without them still succeed. */
export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}
