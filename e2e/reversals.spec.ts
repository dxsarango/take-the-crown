import { createHmac, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { type APIRequestContext, type Page, expect, test } from "@playwright/test";
import en from "../messages/en.json";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";
import { signInByEmail } from "./fixtures/mail";
import { HUMAN_TOKEN } from "./fixtures/payment";

const SCREENS = "test-results/screens";

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({}, info) => {
  // Webhooks and the admin view do not depend on the viewport, except the screenshot.
  test.skip(info.project.name !== "desktop", "server behaviour");
  await mkdir(SCREENS, { recursive: true });
});
test.beforeEach(() => seedKingdom());
test.afterAll(resetKingdom);

/** Takes the crown through the test provider, as a buyer would; returns the provider's payment id. */
async function buy(request: APIRequestContext, name: string): Promise<string> {
  const lock = (await (
    await request.post("/api/locks", { data: { name, email: `${name}@test.local`, locale: "en", message: "Mine now", acceptWithdrawal: true, turnstileToken: HUMAN_TOKEN } })
  ).json()) as { lockId: string };
  expect((await request.post("/api/test-provider/pay", { data: { lockId: lock.lockId } })).status()).toBe(204);
  await expect
    .poll(async () => (await sql<{ status: string }>("select status from payments where lock_id = $1", [lock.lockId]))[0]?.status)
    .toBe("applied");
  return (await sql<{ id: string }>("select provider_payment_id as id from payments where lock_id = $1", [lock.lockId]))[0].id;
}

/** Posts a signed test-provider webhook, as the provider does after a refund or a dispute. */
async function webhook(request: APIRequestContext, event: Record<string, string>): Promise<unknown> {
  const body = JSON.stringify({ eventId: `evt_${randomUUID()}`, ...event });
  const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET ?? "").update(body).digest("hex");
  const response = await request.post("/api/webhooks/test", { headers: { "x-test-signature": signature, "content-type": "application/json" }, data: body });
  expect(response.status()).toBe(200);
  return response.json();
}

async function asAdmin(page: Page) {
  await sql("update profile_private set is_admin = true where email = 'kenji@test.local'");
  await signInByEmail(page, "kenji@test.local", "/en/admin");
}

test("a refund after delivery takes the throne back and marks the reign in the history", async ({ page, request }) => {
  const paymentId = await buy(request, "refunded_king");
  expect(await webhook(request, { type: "refund_succeeded", providerPaymentId: paymentId })).toEqual({ result: "refunded" });

  expect(await sql("select current_reign_id from crown_state")).toEqual([{ current_reign_id: null }]);
  const [reign] = await sql<{ reversal_kind: string; message: string | null }>(
    "select r.reversal_kind, pr.message from reigns r join public_reigns pr on pr.id = r.id where r.name = 'refunded_king'",
  );
  expect(reign).toEqual({ reversal_kind: "refund", message: null });

  await page.goto("/en/kingdom");
  await expect(page.getByRole("link", { name: "refunded_king" }).first()).toBeVisible();
  await expect(page.getByText(en.realm.reversed, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Mine now")).toHaveCount(0);
  await page.screenshot({ path: `${SCREENS}/kingdom-reversed-desktop.png` });
});

test("a chargeback reverses the reign, suspends the buyer and shows in the admin", async ({ page, request }) => {
  const refunded = await buy(request, "refunded_king");
  await webhook(request, { type: "refund_succeeded", providerPaymentId: refunded });
  const disputed = await buy(request, "chargeback_king");
  expect(await webhook(request, { type: "dispute", providerPaymentId: disputed, status: "dispute_opened" })).toEqual({ result: "reversed" });
  expect(await sql("select p.is_banned from profiles p where p.name = 'chargeback_king'")).toEqual([{ is_banned: true }]);
  // A dispute that ends in our favor is only recorded.
  expect(await webhook(request, { type: "dispute", providerPaymentId: disputed, status: "dispute_won" })).toEqual({ result: "recorded" });

  await asAdmin(page);
  await page.goto("/en/admin#reversals");
  const section = page.locator("#reversals");
  await expect(section.getByText(/chargeback_king/)).toBeVisible();
  await expect(section.getByText(/refunded_king/)).toBeVisible();
  await expect(section.getByText(new RegExp(`${en.admin.reversals.chargeback}.*dispute_won`))).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SCREENS}/admin-reversals-desktop.png` });

  // Lifting the suspension from the same list.
  await section.getByRole("listitem").filter({ hasText: "chargeback_king" }).getByRole("button", { name: en.admin.reports.unban }).click();
  await expect.poll(async () => (await sql<{ is_banned: boolean }>("select is_banned from profiles where name = 'chargeback_king'"))[0].is_banned).toBe(false);
});
