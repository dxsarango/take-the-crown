import "server-only";
import { z } from "zod";

const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PAYMENT_PROVIDER: z.enum(["test"]),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  IP_HASH_SALT: z.string().min(16),
  NEXT_PUBLIC_SITE_URL: z.url(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

/** Server secrets, validated on first use so builds without them still succeed. */
export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}
