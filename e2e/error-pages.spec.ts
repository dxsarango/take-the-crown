import { expect, test } from "@playwright/test";
import en from "../messages/en.json";
import es from "../messages/es.json";

for (const locale of ["en", "es"] as const) {
  test(`shows the kingdom's not-found page for unknown paths ${locale}`, async ({ page }, info) => {
    const messages = { en, es }[locale];
    const response = await page.goto(`/${locale}/no-such-page/at-all`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: messages.errors.notFoundTitle })).toBeVisible();
    await expect(page.getByRole("img", { name: messages.errors.crownAlt })).toBeVisible();
    const home = page.getByRole("link", { name: messages.errors.home });
    await page.screenshot({ path: `test-results/screens/not-found-${locale}-${info.project.name}.png` });
    await home.click();
    await page.waitForURL(new RegExp(`/${locale}$`));
  });
}

test("keeps the plain 404 for pages that must not admit they exist", async ({ page }) => {
  const response = await page.goto("/en/admin");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: en.errors.notFoundTitle })).toBeVisible();
  expect(await page.content()).not.toContain(en.admin.title + "</h1>");
});
