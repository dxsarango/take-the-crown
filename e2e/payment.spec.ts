import { createHmac, randomUUID } from "node:crypto";
import { type Page, expect, test } from "@playwright/test";
import en from "../messages/en.json";
import { sql } from "./fixtures/db";
import { latestSignInLink } from "./fixtures/mail";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";

test.afterAll(resetKingdom);

const visible = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
const dialog = (page: Page) => page.getByRole("dialog");

let counter = 0;
function buyer(prefix = "buyer") {
  counter += 1;
  const tag = `${prefix}${counter}${randomUUID().slice(0, 4)}`;
  return { name: tag, email: `${tag}@test.local` };
}

async function openModal(page: Page) {
  await page.getByRole("button", { name: /Take the (crown|empty throne) for/ }).filter({ visible: true }).click();
  await expect(dialog(page)).toBeVisible();
}

async function fillForm(page: Page, input: { name: string; email: string; link?: string; message?: string }) {
  const field = (label: string) => dialog(page).getByLabel(label, { exact: true }).filter({ visible: true });
  await field(en.common.nameL).fill(input.name);
  await field(en.login.emailL).fill(input.email);
  if (input.link) await field(en.payment.linkL).fill(input.link);
  if (input.message) await field(en.payment.msgL).fill(input.message);
  await expect(visible(page, en.payment.nameAvailable)).toBeVisible();
}

async function submit(page: Page) {
  await dialog(page).getByRole("button", { name: /^Pay \$[\d.,]+ and take the crown$/ }).filter({ visible: true }).click();
}

test("a guest takes the crown end to end", async ({ page }) => {
  await seedKingdom();
  const me = buyer("guest");
  await page.goto("/en");
  await openModal(page);
  await fillForm(page, { ...me, link: "turno.app", message: "Beta is open" });
  await submit(page);

  // The lock exists only now: countdown and test checkout.
  await expect(visible(page, en.payment.lockPre)).toBeVisible();
  await expect(dialog(page).getByRole("timer").filter({ visible: true })).toHaveText(/^[45]:\d\d$/);
  await expect(page.getByTestId("test-checkout").filter({ visible: true })).toBeVisible();

  await page.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await expect(visible(page, en.payment.headOk)).toBeVisible({ timeout: 10_000 });

  const [reign] = await sql<{ name: string; link: string; message: string }>(
    "select r.name, r.link, r.message from reigns r join crown_state s on s.current_reign_id = r.id",
  );
  expect(reign).toEqual({ name: me.name, link: "https://turno.app", message: "Beta is open" });

  await dialog(page).getByRole("button", { name: en.common.notNow }).filter({ visible: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  // "Watch your coronation" / closing replays it on the home, then the new king is shown.
  await expect(page.getByRole("heading", { level: 1, name: me.name }).filter({ visible: true })).toBeVisible({ timeout: 5000 });
  await expect(visible(page, "turno.app")).toBeVisible();
});

test("two browsers compete for the same crown", async ({ browser }) => {
  await seedKingdom();
  const [a, b] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([a.newPage(), b.newPage()]);
  const alice = buyer("alice");
  const bob = buyer("bob");

  await Promise.all([pageA.goto("/en"), pageB.goto("/en")]);
  await openModal(pageA);
  await openModal(pageB);
  await fillForm(pageA, alice);
  await fillForm(pageB, bob);

  // Alice locks first.
  await submit(pageA);
  await expect(pageA.getByTestId("test-checkout").filter({ visible: true })).toBeVisible();

  // Bob is refused without being charged, with the same reason everyone sees on the home.
  await submit(pageB);
  await expect(visible(pageB, en.payment.errors.crown_locked.title)).toBeVisible();
  await dialog(pageB).getByRole("button", { name: en.common.close }).filter({ visible: true }).click();
  await expect(visible(pageB, en.homeStates.someone)).toBeVisible({ timeout: 10_000 });

  // Alice pays; both see her crowned.
  await pageA.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await expect(visible(pageA, en.payment.headOk)).toBeVisible({ timeout: 10_000 });
  // Bob watches the coronation (canvas), then the new king.
  await expect(pageB.locator("canvas").filter({ visible: true })).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByRole("heading", { level: 1, name: alice.name }).filter({ visible: true })).toBeVisible({ timeout: 10_000 });

  const reigns = await sql<{ name: string }>("select name from reigns where name in ($1, $2)", [alice.name, bob.name]);
  expect(reigns).toEqual([{ name: alice.name }]);
  await Promise.all([a.close(), b.close()]);
});

test("moderation rejects before any lock exists", async ({ page }) => {
  await seedKingdom();
  await page.goto("/en");
  await openModal(page);
  await fillForm(page, { ...buyer(), link: "bit.ly/turno-beta" });
  await submit(page);
  await expect(visible(page, en.payment.rejLinkT)).toBeVisible();
  await expect(visible(page, en.payment.rejLinkLine)).toBeVisible();
  const [state] = await sql<{ active_lock_id: string | null }>("select active_lock_id from crown_state");
  expect(state.active_lock_id).toBeNull();

  // Fixing the link clears the error and the buyer can go on.
  await dialog(page).getByLabel(en.payment.linkL, { exact: true }).filter({ visible: true }).fill("turno.app");
  await expect(page.getByText(en.payment.rejLinkLine)).toHaveCount(0);
});

test("a declined payment frees the crown and shows the payment error", async ({ page }) => {
  await seedKingdom();
  await page.goto("/en");
  await openModal(page);
  await fillForm(page, buyer());
  await submit(page);
  await page.getByRole("button", { name: en.payment.test.decline }).filter({ visible: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(visible(page, en.homeStates.payErr1)).toBeVisible();
  await expect(visible(page, en.homeStates.payErr2)).toBeVisible();
  await expect.poll(async () => (await sql("select 1 from crown_state where active_lock_id is null")).length).toBe(1);
});

test("an expired lock closes checkout and shows the current price", async ({ page }) => {
  await seedKingdom();
  await page.goto("/en");
  await openModal(page);
  await fillForm(page, buyer());
  await submit(page);
  await expect(page.getByTestId("test-checkout").filter({ visible: true })).toBeVisible();
  await sql("update price_locks set expires_at = now() - interval '1 second' where status = 'active'");
  await sql("update crown_state set active_lock_expires_at = now() - interval '1 second'");
  await expect(visible(page, en.homeStates.exp1)).toBeVisible({ timeout: 10_000 });
  await expect(visible(page, /^The current price is \$/)).toBeVisible();
});

test("paying with someone else's email never crowns their profile", async ({ page }) => {
  await seedKingdom();
  // The king's email, which says nothing about the profile's name.
  await sql("update profile_private set email = 'crowned.owner@test.local' where profile_id = (select id from profiles where name = 'valeruiz')");
  await page.goto("/en");
  await openModal(page);
  await fillForm(page, { name: "impostor", email: "crowned.owner@test.local" });
  await submit(page);
  await expect(visible(page, en.payment.verifyTitle)).toBeVisible();
  await expect(page.getByTestId("test-checkout")).toHaveCount(0);
  // The message never mentions the profile's name.
  await expect(dialog(page)).not.toContainText("valeruiz");

  const locks = await sql("select 1 from price_locks where lower(email) = 'crowned.owner@test.local'");
  expect(locks).toHaveLength(0);
});

test("the owner of a known email verifies it and takes the crown as themselves", async ({ page }) => {
  await seedKingdom();
  const email = `owner.${randomUUID().slice(0, 6)}@test.local`;
  await sql("update profile_private set email = $1 where profile_id = (select id from profiles where name = 'kenji')", [email]);
  await page.goto("/en");
  await openModal(page);
  await fillForm(page, { name: "returning", email, message: "Back again" });
  await submit(page);
  await expect(visible(page, en.payment.verifyTitle)).toBeVisible();

  await page.goto(await latestSignInLink(email));
  // Back on the home with the form restored.
  await expect(dialog(page)).toBeVisible({ timeout: 10_000 });
  await expect(dialog(page).getByLabel(en.payment.msgL, { exact: true }).filter({ visible: true })).toHaveValue("Back again");
  await submit(page);
  await page.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await expect(visible(page, en.payment.headOk)).toBeVisible({ timeout: 10_000 });

  const [reign] = await sql<{ name: string }>(
    "select p.name from reigns r join crown_state s on s.current_reign_id = r.id join profiles p on p.id = r.profile_id",
  );
  expect(reign.name).toBe("kenji");
});

test("screenshots of the payment modal", async ({ page }, testInfo) => {
  await seedKingdom();
  const shot = (name: string) =>
    page.screenshot({ path: `test-results/screens/payment-${name}-${testInfo.project.name}.png` });
  await page.goto("/en");
  await openModal(page);
  await fillForm(page, {
    name: "nadia.builds",
    email: "nadia@test.local",
    link: "bit.ly/turno-beta",
    message: "Shipping a shift planner for night nurses. Beta is open.",
  });
  await shot("form");
  await submit(page);
  await expect(visible(page, en.payment.rejLinkT)).toBeVisible();
  await shot("rejected");
  await dialog(page).getByLabel(en.payment.linkL, { exact: true }).filter({ visible: true }).fill("turno.app");
  await submit(page);
  await expect(page.getByTestId("test-checkout").filter({ visible: true })).toBeVisible();
  await shot("locked");
  await page.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await expect(visible(page, en.payment.headOk)).toBeVisible({ timeout: 10_000 });
  await shot("success");
});

test("screenshot of the coronation", async ({ page }, testInfo) => {
  await seedKingdom();
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1, name: "valeruiz" }).filter({ visible: true })).toBeVisible();
  const lock = await (await page.request.post("/api/locks", { data: { name: "nadia.builds", email: "nadia@test.local", locale: "en" } })).json();
  await page.request.post("/api/test-provider/pay", { data: { lockId: lock.lockId } });
  const canvas = page.locator("canvas").filter({ visible: true });
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(900);
  await canvas.screenshot({ path: `test-results/screens/coronation-mid-${testInfo.project.name}.png` });
  await expect(page.getByRole("heading", { level: 1, name: "nadia.builds" }).filter({ visible: true })).toBeVisible();
});

test("reduced motion swaps the king with a short fade", async ({ browser }) => {
  await seedKingdom();
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1, name: "valeruiz" }).filter({ visible: true })).toBeVisible();
  const lock = await (await page.request.post("/api/locks", { data: { name: "calm.king", email: "calm@test.local", locale: "en" } })).json();
  await page.request.post("/api/test-provider/pay", { data: { lockId: lock.lockId } });
  await expect(page.getByRole("heading", { level: 1, name: "calm.king" }).filter({ visible: true })).toBeVisible({ timeout: 10_000 });
  // The fade lasts 400 ms, then the regular scene is back.
  await expect(page.locator("canvas")).toHaveCount(0, { timeout: 2000 });
  await context.close();
});

test.describe("API", () => {
  const lockBody = (name: string, email: string) => ({ name, email, locale: "en" });

  test("answers claimed and unclaimed profiles the same way", async ({ request }) => {
    await seedKingdom();
    // A real auth user, created the way sign-up would, then linked to the profile.
    const created = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "kenji@test.local", email_confirm: true }),
    });
    const userId = ((await created.json()) as { id: string }).id;
    await sql("update profiles set user_id = $1 where name = 'kenji'", [userId]);

    const claimed = await request.post("/api/locks", { data: lockBody("someone1", "kenji@test.local") });
    const unclaimed = await request.post("/api/locks", { data: lockBody("someone2", "mbali@test.local") });
    expect(claimed.status()).toBe(unclaimed.status());
    expect(await claimed.json()).toEqual(await unclaimed.json());
    expect(await claimed.json()).toEqual({ ok: true, verifyEmail: true });
  });

  test("maps invalid input and database errors to UI states", async ({ request }) => {
    await seedKingdom();
    const bad = await request.post("/api/locks", { data: { name: "x", locale: "en" } });
    expect(bad.status()).toBe(400);
    expect(await bad.json()).toMatchObject({ ok: false, error: "invalid_input", fields: ["name"] });

    const first = await request.post("/api/locks", { data: lockBody("firsttaker", "first@test.local") });
    expect((await first.json()).ok).toBe(true);
    const second = await request.post("/api/locks", { data: lockBody("secondtaker", "second@test.local") });
    expect(second.status()).toBe(409);
    expect(await second.json()).toEqual({ ok: false, error: "crown_locked" });

    const taken = await request.post("/api/locks", { data: lockBody("kenji", "third@test.local") });
    expect(await taken.json()).toMatchObject({ ok: false });
  });

  test("rejects unsigned webhooks and ignores repeats", async ({ request }) => {
    await seedKingdom();
    const lock = await (await request.post("/api/locks", { data: lockBody("hooked", "hooked@test.local") })).json();
    const event = {
      type: "payment_succeeded",
      eventId: `evt_${randomUUID()}`,
      providerPaymentId: `pay_${randomUUID()}`,
      lockId: lock.lockId,
      amountCents: lock.priceCents,
      currency: "USD",
      email: "hooked@test.local",
    };
    const body = JSON.stringify(event);
    const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? "";
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    const unsigned = await request.post("/api/webhooks/test", { data: body, headers: { "content-type": "application/json" } });
    expect(unsigned.status()).toBe(401);

    const headers = { "content-type": "application/json", "x-test-signature": signature };
    expect(await (await request.post("/api/webhooks/test", { data: body, headers })).json()).toEqual({ result: "applied" });
    expect(await (await request.post("/api/webhooks/test", { data: body, headers })).json()).toEqual({ result: "duplicate" });
    expect(await (await request.post("/api/webhooks/unknown", { data: body, headers })).status()).toBe(404);
  });

  test("refunds an invalid payment through the provider", async ({ request }) => {
    await seedKingdom();
    const lock = await (await request.post("/api/locks", { data: lockBody("underpay", "under@test.local") })).json();
    const event = {
      type: "payment_succeeded",
      eventId: `evt_${randomUUID()}`,
      providerPaymentId: `pay_${randomUUID()}`,
      lockId: lock.lockId,
      amountCents: 1,
      currency: "USD",
      email: "under@test.local",
    };
    const body = JSON.stringify(event);
    const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET ?? "").update(body).digest("hex");
    const response = await request.post("/api/webhooks/test", {
      data: body,
      headers: { "content-type": "application/json", "x-test-signature": signature },
    });
    expect(await response.json()).toEqual({ result: "refund_pending" });
    await expect
      .poll(async () => (await sql<{ status: string }>("select status from payments where provider_payment_id = $1", [event.providerPaymentId]))[0]?.status)
      .toBe("refunded");
  });
});
