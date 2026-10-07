import { mkdir } from "node:fs/promises";
import { type APIRequestContext, expect, test } from "@playwright/test";
import en from "../messages/en.json";
import { signInAsAdmin } from "./fixtures/admin";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";
import { HUMAN_TOKEN } from "./fixtures/payment";

const SCREENS = "test-results/screens";
const WALLET_SHORT = 'Dodo POST /refunds answered 409: {"code":"INSUFFICIENT_WALLET_FUNDS","message":"Insufficient funds in wallet"}';

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await mkdir(SCREENS, { recursive: true });
});
test.beforeEach(() => seedKingdom());
test.afterAll(resetKingdom);

/** Takes the crown through the test provider; returns our id for the payment. */
async function buy(request: APIRequestContext, name: string): Promise<string> {
  const lock = (await (
    await request.post("/api/locks", { data: { name, email: `${name}@test.local`, locale: "en", acceptWithdrawal: true, turnstileToken: HUMAN_TOKEN } })
  ).json()) as { lockId: string };
  expect((await request.post("/api/test-provider/pay", { data: { lockId: lock.lockId } })).status()).toBe(204);
  await expect.poll(async () => (await sql<{ status: string }>("select status from payments where lock_id = $1", [lock.lockId]))[0]?.status).toBe("applied");
  return (await sql<{ id: string }>("select id from payments where lock_id = $1", [lock.lockId]))[0].id;
}

test("the admin sees refunds the provider refused and retries them", async ({ page, request }, info) => {
  // Two refunds the provider refused: one still retrying on its own, one whose retries stopped.
  const retrying = await buy(request, "short_wallet");
  const stopped = await buy(request, "lost_payment");
  await sql("update payments set status = 'refund_pending' where id = any($1)", [[retrying, stopped]]);
  await sql(
    "update payments set refund_attempts = 3, refund_next_attempt_at = now() + interval '4 minutes', refund_last_error = $2 where id = $1",
    [retrying, WALLET_SHORT],
  );
  await sql(
    "update payments set refund_attempts = 1, refund_next_attempt_at = null, refund_last_error = 'Dodo POST /refunds answered 404: payment not found' where id = $1",
    [stopped],
  );

  await signInAsAdmin(page, "kenji@test.local");
  await page.goto("/en/admin#refunds");
  const section = page.locator("#refunds");
  const items = section.getByTestId("admin-refund");
  await expect(items).toHaveCount(2);
  await expect(items.filter({ hasText: "short_wallet@test.local" })).toContainText("3 attempts failed. Next try");
  await expect(items.filter({ hasText: "short_wallet@test.local" })).toContainText("INSUFFICIENT_WALLET_FUNDS");
  await expect(items.filter({ hasText: "lost_payment@test.local" })).toContainText("Stopped after 1 attempt");
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SCREENS}/admin-refunds-${info.project.name}.png` });

  // Retrying by hand asks the provider again; its refund webhook settles the payment.
  await items.filter({ hasText: "lost_payment@test.local" }).getByRole("button", { name: en.admin.refunds.retry }).click();
  await expect.poll(async () => (await sql<{ status: string }>("select status from payments where id = $1", [stopped]))[0].status).toBe("refunded");
  await page.goto("/en/admin#refunds");
  await expect(page.locator("#refunds").getByTestId("admin-refund")).toHaveCount(1);
  expect(await sql("select action, target from admin_actions where action = 'retry_refund'")).toEqual([{ action: "retry_refund", target: stopped }]);
});

test("the refunds cron retries what is due and is closed to strangers", async ({ request }) => {
  expect((await request.get("/api/cron/refunds")).status()).toBe(401);
  const due = await buy(request, "due_refund");
  await sql("update payments set status = 'refund_pending' where id = $1", [due]);
  await sql("update payments set refund_attempts = 2, refund_last_error = $2, refund_next_attempt_at = now() - interval '1 second' where id = $1", [due, WALLET_SHORT]);

  const run = await request.get("/api/cron/refunds", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(await run.json()).toEqual({ ok: true, requested: 1, retrying: 0, stopped: 0 });
  await expect.poll(async () => (await sql<{ status: string }>("select status from payments where id = $1", [due]))[0].status).toBe("refunded");
});
