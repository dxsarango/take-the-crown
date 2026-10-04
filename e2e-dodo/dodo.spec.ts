import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { type Frame, type Page, expect, test } from "@playwright/test";
import en from "../messages/en.json";
import { sql } from "../e2e/fixtures/db";
import { resetKingdom, seedKingdom } from "../e2e/fixtures/kingdom";
import { acceptDelivery } from "../e2e/fixtures/payment";

/**
 * Real Dodo Payments test-mode checkouts: hosted checkout page, test card, signed webhooks
 * delivered through the tunnel, the refund API and its webhook. Run with `pnpm e2e:dodo`.
 */

const RECORDED = path.join(process.cwd(), "tests", "fixtures", "dodo", "recorded");
// Dodo's published test card (docs.dodopayments.com/miscellaneous/testing-process).
const CARD = { number: "4242424242424242", expiry: "06/32", cvc: "123", name: "Crown Tester", zip: "10001" };

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  const missing = ["DODO_API_KEY", "DODO_WEBHOOK_SECRET", "DODO_PRODUCT_ID"].filter((k) => !process.env[k]);
  test.skip(missing.length > 0, `Dodo test mode needs ${missing.join(", ")}`);
});
test.beforeEach(() => seedKingdom());
test.afterAll(resetKingdom);

/** Fills the first visible field matching one of the selectors, in the page or any of its frames. */
async function fill(page: Page, selectors: string[], value: string): Promise<void> {
  const scopes: (Page | Frame)[] = [page, ...page.frames()];
  for (const scope of scopes) {
    for (const selector of selectors) {
      const field = scope.locator(selector).first();
      if (await field.isVisible().catch(() => false)) {
        await field.fill(value);
        return;
      }
    }
  }
  throw new Error(`No field for ${selectors.join(" | ")} on Dodo's checkout`);
}

/** Completes Dodo's hosted checkout with the test card and waits to land back on our site. */
async function payOnDodo(page: Page): Promise<void> {
  await page.waitForURL(/dodopayments\.com/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await fill(page, ['input[autocomplete="cc-number"]', 'input[name*="card" i][name*="number" i]', 'input[placeholder*="1234"]'], CARD.number);
  await fill(page, ['input[autocomplete="cc-exp"]', 'input[name*="exp" i]', 'input[placeholder*="MM" i]'], CARD.expiry);
  await fill(page, ['input[autocomplete="cc-csc"]', 'input[name*="cvc" i]', 'input[name*="cvv" i]', 'input[placeholder*="CVC" i]'], CARD.cvc);
  await fill(page, ['input[autocomplete="cc-name"]', 'input[name*="name" i]'], CARD.name).catch(() => undefined);
  await fill(page, ['input[autocomplete="postal-code"]', 'input[name*="zip" i]', 'input[name*="postal" i]'], CARD.zip).catch(() => undefined);
  await page.getByRole("button", { name: /^(pay|complete|buy)/i }).first().click();
  await page.waitForURL((url) => url.hostname === "localhost", { timeout: 90_000 });
}

/** The newest webhook the dev server recorded for an event type, with its signature headers. */
async function lastRecorded(type: string): Promise<{ headers: Record<string, string>; body: string }> {
  const files = (await readdir(RECORDED)).filter((f) => f.startsWith(`${type}-`)).sort();
  expect(files.length, `no ${type} webhook recorded`).toBeGreaterThan(0);
  return JSON.parse(await readFile(path.join(RECORDED, files[files.length - 1]), "utf8"));
}

test("a buyer takes the crown through Dodo's checkout", async ({ page }) => {
  await page.goto("/en");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Take the (crown|empty throne) for/ }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(en.common.nameL, { exact: true }).filter({ visible: true }).fill("dodo_buyer");
  await dialog.getByLabel(en.login.emailL, { exact: true }).filter({ visible: true }).fill("dodo.buyer@test.local");
  await expect(page.getByText(en.payment.nameAvailable).filter({ visible: true }).first()).toBeVisible();
  await acceptDelivery(dialog);
  await dialog.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();

  await payOnDodo(page);
  // Back home, the modal follows the lock until the signed webhook crowns the buyer.
  await expect(page.getByText(en.payment.headOk).filter({ visible: true }).first()).toBeVisible({ timeout: 90_000 });
  const [payment] = await sql<{ provider: string; status: string; amount_cents: number; price_cents: number }>(
    "select p.provider, p.status, p.amount_cents, l.price_cents from payments p join price_locks l on l.id = p.lock_id",
  );
  expect(payment).toMatchObject({ provider: "dodo", status: "applied" });
  expect(payment.amount_cents).toBeGreaterThanOrEqual(payment.price_cents);

  // The same webhook delivered again changes nothing.
  const original = await lastRecorded("payment.succeeded");
  const again = await page.request.post("/api/webhooks/dodo", { headers: original.headers, data: original.body });
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ result: "duplicate" });
  expect(await sql("select 1 from reigns where payment_id is not null and name = 'dodo_buyer'")).toHaveLength(1);
});

test("a payment that arrives after the lock ran out is refunded through Dodo", async ({ page }) => {
  const response = await page.request.post("/api/locks", {
    data: { name: "late_payer", email: "late.payer@test.local", locale: "en", acceptWithdrawal: true },
  });
  const lock = (await response.json()) as { ok: boolean; lockId: string; checkout: { url: string } };
  expect(lock.ok).toBe(true);
  // The lock ran out long ago (past the late-payment grace) and the crown moved on.
  await sql("update price_locks set expires_at = now() - interval '1 hour', status = 'expired' where id = $1", [lock.lockId]);
  await sql("update crown_state set active_lock_id = null, active_lock_expires_at = null");

  await page.goto(lock.checkout.url);
  await payOnDodo(page);

  // Our webhook asks Dodo for the refund; Dodo's refund webhook marks it refunded.
  await expect
    .poll(async () => (await sql<{ status: string }>("select status from payments where lock_id = $1", [lock.lockId]))[0]?.status, {
      timeout: 120_000,
      intervals: [2_000],
    })
    .toBe("refunded");
  expect(await sql("select 1 from reigns r join payments p on p.id = r.payment_id where p.lock_id = $1", [lock.lockId])).toEqual([]);
});
