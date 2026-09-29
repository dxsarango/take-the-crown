import { type Page, expect, test } from "@playwright/test";
import { sql } from "./fixtures/db";
import { resetKingdom } from "./fixtures/kingdom";
import { signInByEmail } from "./fixtures/mail";
import { NEWCOMER, VETERAN, seedProfiles } from "./fixtures/profiles";

const SCREENS = "test-results/screens";

const visible = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true }).first();

test.describe.configure({ mode: "serial" });

test.beforeAll(seedProfiles);
test.afterAll(resetKingdom);

test("shows a veteran's public profile", async ({ page }) => {
  await page.goto(`/en/u/${VETERAN.name}`);
  await expect(page.getByRole("heading", { level: 1, name: VETERAN.name })).toBeVisible();
  await expect(visible(page, "Duke")).toBeVisible();
  await expect(visible(page, "Chosen by priya_ships")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Main rival" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chronicle of reigns" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "X: @priya_ships" }).first()).toHaveAttribute("href", "https://x.com/priya_ships");
  // A visitor never sees the owner's blocks.
  await expect(page.getByText("Come back for the crown.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit profile" })).toHaveCount(0);
});

test("lowercases the URL and follows former names", async ({ page }) => {
  await page.goto(`/en/u/Priya_Ships`);
  await expect(page).toHaveURL(/\/en\/u\/priya_ships$/);

  await sql("insert into profile_name_history (name, profile_id) select 'priya_old', id from profiles where name = $1", [VETERAN.name]);
  await page.goto(`/en/u/priya_old`);
  await expect(page).toHaveURL(/\/en\/u\/priya_ships$/);

  const missing = await page.goto(`/en/u/nobody_here`);
  expect(missing?.status()).toBe(404);
});

test("hides the chronicle and rival when the player chose to", async ({ page }) => {
  await sql("update profiles set show_rival = false, show_chronicle = false where name = $1", [VETERAN.name]);
  await page.goto(`/en/u/${VETERAN.name}`);
  await expect(page.getByRole("heading", { level: 1, name: VETERAN.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Main rival" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Chronicle of reigns" })).toHaveCount(0);
  await sql("update profiles set show_rival = true, show_chronicle = true where name = $1", [VETERAN.name]);
});

test("welcomes a new player on their own profile", async ({ page }) => {
  await signInByEmail(page, NEWCOMER.email, `/en/u/${NEWCOMER.name}`);
  await expect(page.getByRole("heading", { level: 1, name: NEWCOMER.name })).toBeVisible();
  await expect(visible(page, "danielkim took your crown after 11s.")).toBeVisible();
  await expect(visible(page, "Come back for the crown.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Within reach" }).first()).toBeVisible();
  await expect(visible(page, "Next time danielkim reigns, take the crown back.")).toBeVisible();
  await expect(visible(page, "2 of 3 slots")).toBeVisible();
  await expect(visible(page, "Your only clash so far. Even the score to start a rivalry.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit profile" }).first()).toBeVisible();
});

for (const [label, name, own] of [
  ["veteran", VETERAN.name, false],
  ["new", NEWCOMER.name, true],
] as const) {
  for (const locale of ["en", "es"] as const) {
    test(`screenshot ${label} profile ${locale}`, async ({ page }, info) => {
      if (own) await signInByEmail(page, NEWCOMER.email, `/${locale}/u/${name}`);
      else await page.goto(`/${locale}/u/${name}`);
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${SCREENS}/profile-${label}-${locale}-${info.project.name}.png`, fullPage: true });
    });
  }
}
