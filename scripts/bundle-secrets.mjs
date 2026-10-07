// Finds server secrets in client JavaScript (security audit, A04). Used by `pnpm check:deploy` on
// the deployed site's chunks and by `pnpm check:bundle` on a local build, which also looks for the
// actual values in .env.local. Findings name what was found, never the value.

/** Server-only variables (lib/env.server.ts) that hold secrets. */
export const SERVER_SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAYMENT_WEBHOOK_SECRET",
  "IP_HASH_SALT",
  "TURNSTILE_SECRET_KEY",
  "CLOUDFLARE_ORIGIN_SECRET",
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "EMAIL_LINK_SECRET",
  "DODO_API_KEY",
  "DODO_WEBHOOK_SECRET",
];

const PATTERNS = [
  { name: "a Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: "an Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "a Resend API key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/ },
  { name: "a private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "a Standard Webhooks secret", re: /\bwhsec_[A-Za-z0-9+/=]{20,}/ },
];

/** A JWT whose payload says it is the service role (legacy Supabase keys). */
function hasServiceRoleJwt(text) {
  for (const [token] of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    const payload = token.split(".")[1];
    try {
      if (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role === "service_role") return true;
    } catch {
      // Not a JWT after all.
    }
  }
  return false;
}

/**
 * What a chunk reveals. `values` maps variable names to their real values (local builds only):
 * any of them appearing in client code is a leak.
 */
export function findSecrets(text, values = {}) {
  const found = PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
  if (hasServiceRoleJwt(text)) found.push("a Supabase service role key");
  for (const name of SERVER_SECRETS) if (text.includes(name)) found.push(`the name ${name} (server code in the bundle?)`);
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === "string" && value.length >= 12 && text.includes(value)) found.push(`the value of ${name}`);
  }
  return found;
}
