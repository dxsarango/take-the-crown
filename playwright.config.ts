import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { zoneAtNoon } from "./e2e/fixtures/clock";

// Tests sign webhooks with the same secret as the local server.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const port = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${port}`;
// Workers inherit it: fixtures that write to the database drop the app's cache there (e2e/fixtures/cache.ts).
process.env.E2E_BASE_URL = baseURL;

export default defineConfig({
  testDir: "./e2e",
  // UI tests reseed the one local database, so files run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // The game reads the buyer's local hour (the Night Owl medal is for 03:00 to 04:59) and the pages
    // group reigns by local day. In a zone where it is noon now, no spec depends on the hour it runs.
    timezoneId: zoneAtNoon(new Date()),
  },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: { PAYMENT_PROVIDER: "test" },
  },
});
