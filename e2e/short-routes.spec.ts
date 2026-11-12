import { expect, test } from "@playwright/test";
import es from "../messages/es.json";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";

test.afterAll(resetKingdom);
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop", "server behaviour");
});

test("a short route shows the home page under its own address", async ({ page }) => {
  await seedKingdom();
  const response = await page.goto("/7");
  await expect(page).toHaveURL(/\/7$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Take the crown for $34" }).filter({ visible: true }).first()).toBeVisible();
  expect(response?.headers()["x-robots-tag"]).toBe("noindex");
  expect(response?.headers()["content-security-policy"]).toContain("nonce-");
});

test("a short route speaks the visitor's language", async ({ browser }) => {
  await seedKingdom();
  const context = await browser.newContext({ locale: "es-EC" });
  const page = await context.newPage();
  await page.goto("/12");
  await expect(page).toHaveURL(/\/12$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { name: es.home.pitch.title })).toBeVisible();
  await context.close();
});

test("switching language from a short route goes to the home page", async ({ page }) => {
  await seedKingdom();
  await page.goto("/7");
  await page.getByRole("link", { name: "ES", exact: true }).click();
  await expect(page).toHaveURL(/\/es$/);
});

test("the home page is not noindexed by the short routes", async ({ request }) => {
  await seedKingdom();
  const home = await request.get("/en");
  expect(home.headers()["x-robots-tag"]).toBeUndefined();
});
