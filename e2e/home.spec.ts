import { expect, test } from "@playwright/test";
import en from "../messages/en.json";
import es from "../messages/es.json";

test("redirects the root to the default locale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("detects Spanish from Accept-Language", async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-EC" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/es$/);
  await context.close();
});

for (const [locale, messages] of [
  ["en", en],
  ["es", es],
] as const) {
  test(`renders the placeholder home in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.app.placeholderTitle);
    await expect(page.getByRole("link", { name: messages.app.locales[locale] })).toHaveAttribute("aria-current", "true");
  });
}

test("switches locale from the top bar", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("link", { name: es.app.locales.es }).click();
  await expect(page).toHaveURL(/\/es$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(es.app.placeholderTitle);
});

test("screenshot", async ({ page }, testInfo) => {
  await page.goto("/en");
  await page.screenshot({ path: `test-results/home-${testInfo.project.name}.png`, fullPage: true });
});
