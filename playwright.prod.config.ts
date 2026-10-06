import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// The same suite against a production build (`pnpm e2e:prod`): caching, prerendering and bundling
// differ from `next dev`, and some flows (the first takeover of a season) only happen once in
// production. Its own port, so it never reuses a dev server.
const port = 3200;
// Cloudflare's published Turnstile test keys (always pass, invisible): a production build fails the
// human check closed without a secret, and this exercises the real widget.
const TURNSTILE_TEST = { site: "1x00000000000000000000AA", secret: "1x0000000000000000000000000000000AA" };
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL },
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 600_000,
    env: {
      PAYMENT_PROVIDER: "test",
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_TEST.site,
      TURNSTILE_SECRET_KEY: TURNSTILE_TEST.secret,
    },
  },
});
