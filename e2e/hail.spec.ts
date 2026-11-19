import { expect, test } from "@playwright/test";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";

test.afterAll(resetKingdom);

const visible = (locator: ReturnType<import("@playwright/test").Page["getByRole"]>) => locator.filter({ visible: true }).first();
const countText = (n: number) => (n === 0 ? "No hails yet this reign" : n === 1 ? "1 hail this reign" : `${n} hails this reign`);

test("a visitor without an account hails the king, and the page remembers it", async ({ page }) => {
  await seedKingdom();
  await page.goto("/en");
  await expect(page.getByText(countText(0)).filter({ visible: true })).toBeVisible();

  await visible(page.getByRole("button", { name: en.home.hail.button })).click();
  await expect(page.getByText(countText(1)).filter({ visible: true })).toBeVisible();
  const done = visible(page.getByRole("button", { name: en.home.hail.done }));
  await expect(done).toBeDisabled();
  expect(await sql("select hailer_key, profile_id from reign_hails")).toEqual([
    { hailer_key: expect.stringMatching(/^d:[0-9a-f]{64}$/), profile_id: null },
  ]);

  await page.reload();
  await expect(visible(page.getByRole("button", { name: en.home.hail.done }))).toBeDisabled();
  await expect(page.getByText(countText(1)).filter({ visible: true })).toBeVisible();
});

test("the count goes up live when someone else hails", async ({ page }) => {
  await seedKingdom();
  await page.goto("/en");
  await expect(page.getByText(countText(0)).filter({ visible: true })).toBeVisible();
  const [{ id }] = await sql<{ id: number }>("select current_reign_id as id from crown_state");
  await sql("select hail_reign($1, 'd:elsewhere', 'other-ip')", [id]);
  await expect(page.getByText(countText(1)).filter({ visible: true })).toBeVisible();
  // This browser has not hailed: the button is still there.
  await expect(visible(page.getByRole("button", { name: en.home.hail.button }))).toBeEnabled();
});

test("speaks Spanish, and tells a visitor when their connection has hailed too often", async ({ browser }) => {
  await seedKingdom();
  const [{ id }] = await sql<{ id: number }>("select current_reign_id as id from crown_state");
  const cap = (await sql<{ cap: number }>("select max_anonymous_hails_per_ip_per_reign as cap from app_config"))[0].cap;
  // The test server sees every browser at one address, so other devices use up its share.
  const context = await browser.newContext({ locale: "es-EC" });
  const page = await context.newPage();
  await page.goto("/es");
  await visible(page.getByRole("button", { name: es.home.hail.button })).click();
  await expect(visible(page.getByRole("button", { name: es.home.hail.done }))).toBeDisabled();
  const [{ ip_hash }] = await sql<{ ip_hash: string }>("select ip_hash from reign_hails limit 1");
  for (let i = 0; i < cap - 1; i++) await sql("select hail_reign($1, $2, $3)", [id, `d:filler${i}`, ip_hash]);
  await context.close();

  const another = await browser.newContext({ locale: "es-EC" });
  const second = await another.newPage();
  await second.goto("/es");
  await visible(second.getByRole("button", { name: es.home.hail.button })).click();
  await expect(second.getByRole("alert").filter({ hasText: es.home.hail.limit })).toBeVisible();
  await expect(visible(second.getByRole("button", { name: es.home.hail.button }))).toBeEnabled();
  await another.close();
});

test("screenshots of the hail panel", async ({ page }, testInfo) => {
  await seedKingdom();
  const [{ id }] = await sql<{ id: number }>("select current_reign_id as id from crown_state");
  for (let i = 0; i < 128; i++) await sql("select hail_reign($1, $2, $3)", [id, `d:fan${i}`, `ip-${i}`]);
  await page.goto("/en");
  await expect(page.getByText(countText(128)).filter({ visible: true })).toBeVisible();
  const shot = (name: string) => page.screenshot({ path: `test-results/screens/hail-${name}-${testInfo.project.name}.png`, fullPage: false });
  await shot("idle");
  await visible(page.getByRole("button", { name: en.home.hail.button })).click();
  await expect(visible(page.getByRole("button", { name: en.home.hail.done }))).toBeDisabled();
  await shot("hailed");
});
