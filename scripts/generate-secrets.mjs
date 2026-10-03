// Prints fresh random values for the secrets the app makes up itself, as NAME=value lines to paste
// into Vercel (Settings → Environment Variables, Production). Run it yourself; never commit the output.
import { randomBytes } from "node:crypto";

const SECRETS = {
  PAYMENT_WEBHOOK_SECRET: 32,
  IP_HASH_SALT: 32,
  CRON_SECRET: 32,
  EMAIL_LINK_SECRET: 48,
  CLOUDFLARE_ORIGIN_SECRET: 48,
};

for (const [name, bytes] of Object.entries(SECRETS)) {
  console.log(`${name}=${randomBytes(bytes).toString("base64url")}`);
}
