import { type Page, expect, test } from "@playwright/test";

test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop", "same bundles at every viewport");
});

/** The JavaScript a page loads, as text, until the network is quiet. */
async function loadedScripts(page: Page, path: string): Promise<string[]> {
  const urls: string[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") urls.push(response.url());
  });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  expect(urls.length).toBeGreaterThan(5);
  return Promise.all(urls.map(async (url) => (await page.request.get(url)).text()));
}

const hasRealtimeClient = (scripts: string[]) => scripts.some((code) => code.includes("phx_join"));

// The realtime client is about 40% of the JavaScript a page ships. Only pages that listen to the
// database need it; dialogs and toasts load when something opens them.
test.describe("pages without live data do not load the realtime client", () => {
  for (const path of ["/en/rules", "/en/faq", "/en/hall-of-fame", "/en/seasons/genesis"]) {
    test(path, async ({ page }) => {
      expect(hasRealtimeClient(await loadedScripts(page, path))).toBe(false);
    });
  }
});

test("the home page still listens for the crown", async ({ page }) => {
  expect(hasRealtimeClient(await loadedScripts(page, "/en"))).toBe(true);
});

test("the sign-in dialog loads when it opens, not before", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") scripts.push(response.url());
  });
  await page.goto("/en/rules");
  await page.waitForLoadState("networkidle");
  const before = scripts.length;
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(scripts.length).toBeGreaterThan(before);
});
