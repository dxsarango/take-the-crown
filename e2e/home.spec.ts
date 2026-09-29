import { expect, test } from "@playwright/test";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";

// Every test reseeds the one local database; playwright.config.ts runs them one at a time.
test.afterAll(resetKingdom);

const messages = { en, es } as const;

test("redirects the root to the default locale", async ({ page }) => {
  await seedKingdom();
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

test("switches locale from the top bar", async ({ page }) => {
  await seedKingdom();
  await page.goto("/en");
  await page.getByRole("link", { name: "ES", exact: true }).click();
  await expect(page).toHaveURL(/\/es$/);
  await expect(page.getByRole("heading", { name: es.home.succession })).toBeVisible();
});

test("shows the king, the live clock and the decaying price", async ({ page }) => {
  await seedKingdom();
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1, name: "valeruiz" }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Built a budget app for freelancers in Latam.").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Take the crown for $34" }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Dropping 2% every hour").filter({ visible: true }).first()).toBeVisible();

  const link = page.getByRole("link", { name: "pesito.app" }).filter({ visible: true }).first();
  await expect(link).toHaveAttribute("rel", "sponsored ugc noopener");
  await expect(link).toHaveAttribute("target", "_blank");

  // The clock ticks from server timestamps.
  const seconds = page.locator("main .tabular-nums").nth(2);
  const before = await seconds.textContent();
  await expect(seconds).not.toHaveText(before ?? "", { timeout: 3000 });
});

test("lists the line of succession, hall of fame and proclamations", async ({ page }) => {
  await seedKingdom();
  await page.goto("/en");
  const succession = page.locator("section", { has: page.getByRole("heading", { name: en.home.succession }) });
  await expect(succession.getByRole("listitem")).toHaveCount(10);
  await expect(succession.getByRole("listitem").first()).toContainText("kenji");
  await expect(succession.getByRole("listitem").first()).toContainText("3h 12m");

  await expect(page.getByText("31h 07m").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("theo_builds").filter({ visible: true }).first()).toBeVisible();

  await expect(page.getByText("fell to").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("first of their nation").filter({ visible: true }).first()).toBeVisible();
});

test("shows the empty throne at the start of a season", async ({ page }) => {
  await seedKingdom({ empty: true });
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1, name: en.homeStates.empty1 }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Be the first king of Season 0.").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Take the empty throne for $5" }).filter({ visible: true }).first()).toBeVisible();
});

test("shows someone else's lock with its countdown", async ({ page }) => {
  await seedKingdom({ lockSecondsLeft: 272 });
  await page.goto("/en");
  await expect(page.getByText(en.homeStates.someone).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/^4:[0-3]\d$/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Take the crown/ })).toHaveCount(0);
});

test("shows the floor price state", async ({ page }) => {
  await seedKingdom({ atFloor: true });
  await page.goto("/en");
  await expect(page.getByText(en.homeStates.lowest).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Take the crown for $5" }).filter({ visible: true }).first()).toBeVisible();
});

test("updates live when the crown changes hands", async ({ page }) => {
  await seedKingdom();
  await page.goto("/en");
  await expect(page.getByText(en.homeStates.someone)).toHaveCount(0);
  await seedKingdom({ lockSecondsLeft: 200 });
  await expect(page.getByText(en.homeStates.someone).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
});

for (const season of [0, 1] as const) {
  for (const locale of ["en", "es"] as const) {
    test(`screenshot T${season} ${locale}`, async ({ page }, testInfo) => {
      await seedKingdom({ season });
      await page.goto(`/${locale}`);
      await expect(page.getByRole("heading", { name: messages[locale].home.succession })).toBeVisible();
      await page.screenshot({ path: `test-results/screens/home-t${season}-${locale}-${testInfo.project.name}.png`, fullPage: true });
    });
  }
}

for (const [state, options] of [
  ["empty", { empty: true }],
  ["locked", { lockSecondsLeft: 272 }],
  ["floor", { atFloor: true }],
] as const) {
  test(`screenshot ${state} state`, async ({ page }, testInfo) => {
    await seedKingdom(options);
    await page.goto("/en");
    await page.screenshot({ path: `test-results/screens/home-${state}-${testInfo.project.name}.png` });
  });
}
