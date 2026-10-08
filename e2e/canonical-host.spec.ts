import { expect, test } from "@playwright/test";

// Only the production build enforces the canonical host: `pnpm e2e:prod`.
const FOREIGN = { host: "take-the-crown-preview.vercel.app" };
const CRON_ROUTES = ["moderation", "notifications", "refunds"];

test.describe("canonical host", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(test.info().project.name !== "desktop", "server behaviour");
    const probe = await request.get("/api/health", { headers: FOREIGN, maxRedirects: 0 });
    test.skip(probe.status() === 200, "this server does not enforce the canonical host (use pnpm e2e:prod)");
  });

  test("sends pages and API calls on another host to the site", async ({ request, baseURL }) => {
    const SITE = new URL(baseURL!).origin;
    // Next shortens a redirect to the address the server listens on, which here is also the canonical
    // one; resolving it against the site gives the same address either way. tests/unit/canonical-host.test.ts
    // covers the absolute form.
    const target = (location: string) => new URL(location, SITE).href;
    const page = await request.get("/en/kingdom?season=genesis", { headers: FOREIGN, maxRedirects: 0 });
    expect(page.status()).toBe(308);
    expect(target(page.headers().location)).toBe(`${SITE}/en/kingdom?season=genesis`);
    const api = await request.post("/api/locks", { headers: FOREIGN, maxRedirects: 0, data: {} });
    expect(api.status()).toBe(308);
    expect(target(api.headers().location)).toBe(`${SITE}/api/locks`);
  });

  test("serves the site's own host", async ({ request }) => {
    expect((await request.get("/api/health")).status()).toBe(200);
  });

  test("keeps the crons running on any host, with the secret only", async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, "CRON_SECRET is not set");
    for (const name of CRON_ROUTES) {
      const route = `/api/cron/${name}`;
      const withSecret = await request.get(route, { headers: { ...FOREIGN, authorization: `Bearer ${secret}` }, maxRedirects: 0 });
      expect(withSecret.status(), name).toBe(200);
      const without = await request.get(route, { headers: FOREIGN, maxRedirects: 0 });
      expect(without.status(), name).toBe(308);
      const wrong = await request.get(route, { headers: { ...FOREIGN, authorization: "Bearer wrong" }, maxRedirects: 0 });
      expect(wrong.status(), name).toBe(308);
    }
    // The secret opens the cron routes only.
    const other = await request.get("/api/health", { headers: { ...FOREIGN, authorization: `Bearer ${secret}` }, maxRedirects: 0 });
    expect(other.status()).toBe(308);
  });
});
