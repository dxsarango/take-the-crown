import { mkdir } from "node:fs/promises";
import { type Page, expect, test } from "@playwright/test";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";
import { signInByEmail } from "./fixtures/mail";
import { HUMAN_TOKEN, acceptDelivery } from "./fixtures/payment";

const SCREENS = "test-results/screens";

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ request }) => {
  await mkdir(SCREENS, { recursive: true });
  // The home page caches its data for 10 s and nothing clears it when prelaunch is switched in
  // SQL (the admin's launch action does): let the old entry expire, then refill it.
  await seedKingdom();
  await sql("update app_config set prelaunch = true");
  await new Promise((resolve) => setTimeout(resolve, 11_000));
  await request.get("/en");
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  await request.get("/en");
});
test.beforeEach(async () => {
  await seedKingdom();
  await sql("update app_config set prelaunch = true");
});
test.afterAll(resetKingdom);

const shown = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
const takeButton = (page: Page) => page.getByRole("button", { name: /^Take the (crown|empty throne) for/ }).filter({ visible: true });

test("visitors see the whole site, with the crown launching soon", async ({ page }) => {
  for (const [locale, messages] of [
    ["en", en],
    ["es", es],
  ] as const) {
    await page.goto(`/${locale}`);
    await page.waitForLoadState("networkidle");
    await expect(shown(page, messages.home.soon)).toBeVisible();
    await expect(shown(page, messages.home.soonNote)).toBeVisible();
    await expect(page.getByRole("button", { name: /Take the|Toma la/ }).filter({ visible: true })).toHaveCount(0);
    await page.screenshot({ path: `${SCREENS}/prelaunch-home-${locale}-${test.info().project.name}.png` });
  }

  // A link from another page opens nothing.
  await page.goto("/en?take=1");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Everything else is open.
  for (const path of ["/en/kingdom", "/en/hall-of-fame", "/en/u/kenji", "/en/terms"]) {
    expect((await page.request.get(path)).status(), path).toBe(200);
  }
});

test("the server refuses anyone but an admin", async ({ request }) => {
  test.skip(test.info().project.name !== "desktop", "server behaviour");
  const response = await request.post("/api/locks", {
    data: { name: "eager_buyer", email: "eager@test.local", locale: "en", acceptWithdrawal: true, turnstileToken: HUMAN_TOKEN },
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ ok: false, error: "prelaunch" });
});

test("an admin takes the crown with the test provider", async ({ page }) => {
  await sql("update profile_private set is_admin = true where email = 'mbali@test.local'");
  await signInByEmail(page, "mbali@test.local", "/en");
  await page.waitForLoadState("networkidle");
  await expect(shown(page, en.home.adminTest)).toBeVisible();
  await takeButton(page).click();
  const dialog = page.getByRole("dialog");
  await acceptDelivery(dialog);
  await dialog.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await expect(page.getByTestId("test-checkout").filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await expect(shown(page, en.payment.headOk)).toBeVisible({ timeout: 10_000 });
  const [king] = await sql<{ name: string }>("select p.name from crown_state c join reigns r on r.id = c.current_reign_id join profiles p on p.id = r.profile_id");
  expect(king.name).toBe("mbali");

  // Launching shows the resulting season dates first: a late launch stretches Genesis to 14 days
  // and moves Frost and Day of the Dead by the same amount.
  await page.goto("/en/admin#launch");
  const launch = page.locator("#launch");
  await launch.getByLabel(en.admin.launch.startsAt).fill("2026-11-25T00:00");
  await launch.getByRole("button", { name: en.admin.launch.preview }).click();
  await expect(launch.getByRole("row", { name: /genesis.*Nov 25, 2026.*Dec 9, 2026/ })).toBeVisible();
  await expect(launch.getByRole("row", { name: /frost.*Dec 9, 2026.*Jan 9, 2027/ })).toBeVisible();
  await expect(launch.getByRole("row", { name: /day-of-the-dead.*Nov 9, 2027.*Dec 9, 2027/ })).toBeVisible();
  await expect(launch.getByText(en.admin.launch.extended.replace("{days}", "14"))).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/admin-launch-plan-${test.info().project.name}.png`, fullPage: false });
  // The confirm step needs the real payment provider.
  await expect(launch.getByText(en.admin.launch.needProvider)).toBeVisible();
  expect(await sql("select prelaunch from app_config")).toEqual([{ prelaunch: true }]);
});
