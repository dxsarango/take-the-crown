import { mkdir, writeFile } from "node:fs/promises";
import { type Page, expect, test } from "@playwright/test";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";
import { signInByEmail } from "./fixtures/mail";
import { HUMAN_TOKEN, acceptDelivery } from "./fixtures/payment";

// The first takeover of a season happens once per season in production: the throne is empty, there
// is no previous king to take the crown from, and the reign earns the season's opening achievements.

const SCREENS = "test-results/screens";
const EMAIL = "first@test.local";
// A Genesis reign at the floor price from Ecuador, the first from its country.
const OPENING_ACHIEVEMENTS = ["bargain_hunter", "first_blood", "founder", "patriot"];

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await mkdir(SCREENS, { recursive: true });
});
test.beforeEach(async () => {
  await seedKingdom({ empty: true });
  await sql("update app_config set prelaunch = false");
});
test.afterAll(resetKingdom);

const shown = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
const canvas = (page: Page) => page.locator("canvas").filter({ visible: true });
const messages = { en, es } as const;
const lockBody = (name: string, email: string) => ({ name, email, locale: "en", acceptWithdrawal: true, turnstileToken: HUMAN_TOKEN });

/** Signs the buyer in (which creates their profile) and gives them a country; returns their name. */
async function buyer(page: Page, locale: "en" | "es"): Promise<string> {
  await signInByEmail(page, EMAIL, `/${locale}`);
  const [{ name }] = await sql<{ name: string }>(
    "update profiles p set country_code = 'EC' from profile_private pp where pp.profile_id = p.id and pp.email = $1 returning p.name",
    [EMAIL],
  );
  return name;
}

/** The home page caches its data for a few seconds; wait until it shows the empty throne. */
async function openEmptyThrone(page: Page, locale: "en" | "es") {
  await expect(async () => {
    await page.goto(`/${locale}`);
    await expect(shown(page, messages[locale].homeStates.empty1)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

async function earned(name: string): Promise<string[]> {
  const rows = await sql<{ code: string }>(
    "select a.achievement_code as code from profile_achievements a join profiles p on p.id = a.profile_id where p.name = $1 order by 1",
    [name],
  );
  return rows.map((r) => r.code);
}

for (const locale of ["en", "es"] as const) {
  const m = messages[locale];

  test(`the first takeover of a season crowns the buyer on the empty throne (${locale})`, async ({ page }, testInfo) => {
    const name = await buyer(page, locale);
    await openEmptyThrone(page, locale);
    await expect(shown(page, m.home.noReigns)).toBeVisible();

    await page.getByRole("button", { name: m.homeStates.takeFirst.replace("{price}", "$5") }).filter({ visible: true }).click();
    const dialog = page.getByRole("dialog");
    await acceptDelivery(dialog);
    await dialog.getByRole("button", { name: m.payment.pay.replace("{price}", "$5") }).filter({ visible: true }).click();
    const checkout = page.getByTestId("test-checkout").filter({ visible: true });
    await expect(checkout.getByText(m.common.taxes)).toBeVisible();
    await checkout.getByRole("button", { name: m.payment.test.pay.replace("{price}", "$5") }).click();
    await expect(shown(page, m.payment.headOk)).toBeVisible({ timeout: 10_000 });

    // The coronation plays behind the modal: the crown comes down onto the first king.
    await expect(canvas(page)).toBeVisible({ timeout: 5000 });
    if (locale === "en") {
      // The modal covers the stage, so read a frame from the canvas itself.
      const png = await canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"), undefined, { timeout: 1000 }).catch(() => null);
      if (png) await writeFile(`${SCREENS}/coronation-first-${testInfo.project.name}.png`, Buffer.from(png.split(",")[1], "base64"));
    }
    await expect(page.getByRole("heading", { level: 1, name }).filter({ visible: true })).toBeVisible({ timeout: 5000 });
    await expect(page.locator("canvas")).toHaveCount(0, { timeout: 5000 });
    // The line of succession holds past kings only; it must not say nobody has reigned.
    await expect(shown(page, m.home.noPastReigns)).toBeVisible();

    // The opening achievements are awarded and listed next to the victory card; their toasts wait
    // for the modal to close.
    expect(await earned(name)).toEqual(OPENING_ACHIEVEMENTS);
    await expect(page.getByTestId("unlock-toast")).toHaveCount(0);
    const share = page.getByTestId("reign-share").filter({ visible: true });
    await expect(share.getByText(m.payment.share.title)).toBeVisible();
    await expect(share.getByRole("img", { name: m.payment.share.cardAlt.replace("{name}", name) })).toBeVisible();
    for (const key of ["firstBlood", "founder", "bag", "patriot"] as const) {
      await expect(share.getByText(m.medals[key].name, { exact: true })).toBeVisible();
    }
    await expect.poll(() => share.locator("img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1200);
    await page.screenshot({ path: `${SCREENS}/payment-success-shared-${locale}-${testInfo.project.name}.png` });

    // "Watch your coronation" replays it.
    await page.getByRole("button", { name: m.payment.watch }).filter({ visible: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(canvas(page)).toBeVisible({ timeout: 2000 });
    await expect(page.getByTestId("unlock-toast")).toBeVisible({ timeout: 5000 });
  });
}

test("back from a redirect checkout, the first coronation still plays and the achievements are announced", async ({ page }) => {
  const name = await buyer(page, "en");
  await openEmptyThrone(page, "en");
  // As with Dodo: the buyer pays on the provider's page, the webhook crowns them, then the browser
  // comes back to a page that already shows them on the throne.
  const lock = (await (await page.request.post("/api/locks", { data: lockBody(name, EMAIL) })).json()) as {
    lockId: string;
  };
  expect((await page.request.post("/api/test-provider/pay", { data: { lockId: lock.lockId } })).status()).toBe(204);
  await page.goto(`/en?lock=${lock.lockId}&status=succeeded`);

  await expect(shown(page, en.payment.headOk)).toBeVisible({ timeout: 10_000 });
  await expect(canvas(page)).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("heading", { level: 1, name }).filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId("reign-share").filter({ visible: true }).getByText(en.medals.firstBlood.name, { exact: true })).toBeVisible();

  await expect(page.locator("canvas")).toHaveCount(0, { timeout: 5000 });
  await page.getByRole("button", { name: en.payment.watch }).filter({ visible: true }).click();
  await expect(canvas(page)).toBeVisible({ timeout: 2000 });
  await expect(page.getByTestId("unlock-toast")).toBeVisible({ timeout: 10_000 });
});

test("reduced motion fades the first king in", async ({ browser }) => {
  await seedKingdom({ empty: true });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await openEmptyThrone(page, "en");
  const lock = await (await page.request.post("/api/locks", { data: lockBody("calm.first", "calm@test.local") })).json();
  await page.request.post("/api/test-provider/pay", { data: { lockId: lock.lockId } });
  await expect(page.getByRole("heading", { level: 1, name: "calm.first" }).filter({ visible: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("canvas")).toHaveCount(0, { timeout: 2000 });
  await context.close();
});
