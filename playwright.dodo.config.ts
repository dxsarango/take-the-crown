import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// End-to-end run against Dodo Payments in test mode (`pnpm e2e:dodo`). Needs DODO_API_KEY,
// DODO_WEBHOOK_SECRET and DODO_PRODUCT_ID in .env.local, and a tunnel that forwards the webhook
// endpoint configured in Dodo's test dashboard to this server (docs/DEPLOY.md, "Dodo Payments").
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const port = 3100;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e-dodo",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm exec next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PAYMENT_PROVIDER: "dodo", DODO_MODE: "test", NEXT_PUBLIC_SITE_URL: baseURL, DODO_RECORD_WEBHOOKS: "1" },
  },
});
