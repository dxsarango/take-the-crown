import { mkdir } from "node:fs/promises";
import { type Page, expect, test } from "@playwright/test";
import sharp from "sharp";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";
import { clearMail } from "./fixtures/mail";
import { acceptDelivery } from "./fixtures/payment";

const MAILPIT = "http://127.0.0.1:54324/api/v1";
const SCREENS = "test-results/screens";

type Message = { ID: string; Subject: string; HTML: string; Text: string; To: { Address: string }[] };

async function mailTo(address: string, subject?: RegExp): Promise<Message> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const list = (await (await fetch(`${MAILPIT}/messages?limit=50`)).json()) as { messages: (Message & { Subject: string })[] };
        id = list.messages.find((m) => m.To.some((t) => t.Address === address) && (!subject || subject.test(m.Subject)))?.ID;
        return id;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return (await (await fetch(`${MAILPIT}/message/${id}`)).json()) as Message;
}

async function headers(id: string): Promise<Record<string, string[]>> {
  return (await (await fetch(`${MAILPIT}/message/${id}/headers`)).json()) as Record<string, string[]>;
}

async function runCron(page: Page) {
  const response = await page.request.get("/api/cron/notifications", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(response.status(), await response.text()).toBe(200);
  const { sent, failed, skipped } = (await response.json()) as { sent: number; failed: number; skipped: number };
  return { sent, failed, skipped };
}

async function takeTheCrown(page: Page, name: string) {
  await page.goto("/en");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Take the crown for/ }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(en.common.nameL, { exact: true }).filter({ visible: true }).fill(name);
  await dialog.getByLabel(en.login.emailL, { exact: true }).filter({ visible: true }).fill(`${name}@test.local`);
  await expect(page.getByText(en.payment.nameAvailable).filter({ visible: true }).first()).toBeVisible();
  await acceptDelivery(dialog);
  await dialog.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await expect(page.getByTestId("test-checkout").filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await expect(page.getByText(en.payment.headOk).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
}

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({}, info) => {
  // The emails are the same whatever the browser viewport: one project runs them.
  test.skip(info.project.name !== "desktop", "emails do not depend on the viewport");
  await mkdir(SCREENS, { recursive: true });
});
test.beforeEach(async () => {
  await seedKingdom();
  await clearMail();
});
test.afterAll(async ({}, info) => {
  if (info.project.name === "desktop") await resetKingdom();
});

test("emails the dethroned king right after the takeover", async ({ page }) => {
  await takeTheCrown(page, "new_king");
  const mail = await mailTo("valeruiz@test.local");

  expect(mail.Subject).toBe("You were dethroned by new_king");
  const [old] = await sql<{ id: string }>("select id from reigns where name = 'valeruiz' and dethroned_by is not null");
  expect(mail.HTML).toContain(en.share.mTitle);
  expect(mail.HTML).toContain(en.share.btn);
  expect(mail.HTML).toContain(`/og/mail/${old.id}`);
  expect(mail.HTML).toContain("new_king · new king");
  expect(mail.HTML).toContain("The price drops 2% every hour. Floor price $5.");
  expect(mail.Text).toContain("You were dethroned after 5h 41m by new_king");
  expect(mail.Text).toMatch(/Take it back for \$\d+/);

  const [row] = await sql("select sent_at is not null as sent, attempts from notifications where kind = 'dethroned'");
  expect(row).toEqual({ sent: true, attempts: 1 });

  // The header image and the inline flag are PNG, sized for exact downscales.
  const art = await page.request.get(`/og/mail/${old.id}`);
  expect(art.headers()["content-type"]).toBe("image/png");
  expect(await sharp(await art.body()).metadata()).toMatchObject({ width: 1320, height: 528 });

  // Visual check at 600 and 375 px against the design.
  for (const [label, width] of [
    ["desktop", 760],
    ["mobile", 375],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(mail.HTML);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    await page.screenshot({ path: `${SCREENS}/email-dethroned-${label}.png`, fullPage: true });
  }
});

test("turns the alert off from the email after asking, and with one click", async ({ page }) => {
  await takeTheCrown(page, "new_king");
  const mail = await mailTo("valeruiz@test.local");
  const link = /href="([^"]+\/en\/alerts\/off\?token=[^"]+)"/.exec(mail.HTML)?.[1].replaceAll("&amp;", "&");
  expect(link).toBeTruthy();

  await page.goto(link!);
  await expect(page.getByRole("heading", { name: "Turn off dethrone alerts?" })).toBeVisible();
  expect((await sql("select alerts_dethroned from profile_private where email = 'valeruiz@test.local'"))[0].alerts_dethroned).toBe(true);
  await page.getByRole("button", { name: en.email.off.confirm }).click();
  await expect(page.getByText(en.email.off.done)).toBeVisible();
  expect((await sql("select alerts_dethroned from profile_private where email = 'valeruiz@test.local'"))[0].alerts_dethroned).toBe(false);

  // Mail clients unsubscribe with a POST to the List-Unsubscribe address.
  const list = (await headers(mail.ID))["List-Unsubscribe"]?.[0] ?? "";
  expect((await headers(mail.ID))["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);
  const oneClick = /<([^>]+)>/.exec(list)?.[1] ?? "";
  expect(oneClick).toContain("/api/alerts/off?token=");
  await sql("update profile_private set alerts_dethroned = true where email = 'valeruiz@test.local'");
  expect((await page.request.post(oneClick)).status()).toBe(200);
  expect((await sql("select alerts_dethroned from profile_private where email = 'valeruiz@test.local'"))[0].alerts_dethroned).toBe(false);

  // A tampered token changes nothing.
  expect((await page.request.post(oneClick.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).status()).toBe(400);
  await page.goto("/en/alerts/off?token=nope");
  await expect(page.getByText(en.email.off.invalid)).toBeVisible();
});

test("writes to each player in their language", async ({ page }) => {
  await sql("update profile_private set locale = 'es' where email = 'valeruiz@test.local'");
  await takeTheCrown(page, "nuevo_rey");
  const mail = await mailTo("valeruiz@test.local");
  expect(mail.Subject).toBe("nuevo_rey te quitó la corona");
  expect(mail.HTML).toContain(es.share.btn);
  expect(mail.HTML).toContain("/es/alerts/off?token=");
});

test("the cron sends the other alerts and skips the ones that no longer apply", async ({ page }) => {
  expect((await page.request.get("/api/cron/notifications")).status()).toBe(401);

  const [kenji] = await sql<{ id: string }>("select id from profiles where name = 'kenji'");
  const [admin] = await sql<{ id: string }>("select id from profiles where name = 'mbali'");
  const [reign] = await sql<{ id: string }>("select current_reign_id as id from crown_state");
  const [crown] = await sql<{ price: number }>("select price_cents as price from public_crown_state");
  await sql(
    "update profile_private set alerts_season_start = true, alerts_price_below_cents = $2 where profile_id = $1",
    [kenji.id, crown.price + 100],
  );
  await sql("update profile_private set is_admin = true where profile_id = $1", [admin.id]);
  await sql(
    `insert into notifications (kind, profile_id, payload) values
       ('season_started', $1, '{"season_id": 1, "slug": "frost"}'),
       ('price_drop', $1, jsonb_build_object('price_cents', $2::int, 'threshold_cents', $3::int, 'season_id', 0)),
       ('price_drop', $1, jsonb_build_object('price_cents', 100, 'threshold_cents', 100, 'season_id', 0)),
       ('reports_threshold', $4, jsonb_build_object('reign_id', $5::bigint, 'reports', 3)),
       ('season_extended', $4, '{"season_id": 12, "ends_at": "2028-01-01T00:00:00Z"}'),
       ('season_not_ready', $4, '{"season_id": 2, "starts_at": "2027-01-01T00:00:00Z", "name_final": false, "art_final": false}'),
       ('refunds_stuck', $4, '{"count": 2, "oldest_at": "2026-10-05T12:00:00Z"}'),
       ('mystery', $1, '{}')`,
    [kenji.id, crown.price, crown.price + 100, admin.id, reign.id],
  );

  expect(await runCron(page)).toEqual({ sent: 6, failed: 0, skipped: 2 });
  expect((await mailTo("kenji@test.local", /has started/)).Subject).toBe("Season 1: Frost has started");
  expect((await mailTo("kenji@test.local", /down to/)).HTML).toContain("Take the crown for");
  const report = await mailTo("mbali@test.local", /reports/);
  expect(report.Subject).toBe("A message reached 3 reports");
  // The crown never closes for want of a season: the admins hear about the extension, and about
  // seasons coming without their final name or art. Titles come from the seasons table.
  const extended = await mailTo("mbali@test.local", /now ends/);
  expect(extended.Subject).toBe("Season 12: Day of the Dead now ends on January 1, 2028");
  expect(extended.HTML).toContain("/en/admin#seasons");
  const notReady = await mailTo("mbali@test.local", /isn't ready/);
  expect(notReady.Subject).toBe("Season 2: January 2027 starts on January 1, 2027 and isn't ready");
  expect(notReady.Text).toContain("Its final name and art are still missing.");
  expect(report.HTML).toContain("/en/admin#reports");
  const stuck = await mailTo("mbali@test.local", /stuck/);
  expect(stuck.Subject).toBe("2 refunds are stuck");
  expect(stuck.Text).toContain("the oldest from October 5, 2026");
  expect(stuck.HTML).toContain("/en/admin#refunds");

  const skipped = await sql("select kind, last_error from notifications where failed_at is not null order by kind");
  expect(skipped).toEqual([
    { kind: "mystery", last_error: "skipped: unknown_kind" },
    { kind: "price_drop", last_error: "skipped: stale" },
  ]);
  // Nothing is left to send, so a second run does nothing.
  expect(await runCron(page)).toEqual({ sent: 0, failed: 0, skipped: 0 });
});

test("serves flags and avatars as images for emails and cards", async ({ page }) => {
  const flag = await page.request.get("/og/flag/JP.png");
  expect(await sharp(await flag.body()).metadata()).toMatchObject({ width: 48, height: 32, format: "png" });
  expect((await page.request.get("/og/flag/PT.png")).status()).toBe(200);
  expect((await page.request.get("/og/flag/jp.png")).status()).toBe(404);

  const avatar = await page.request.get("/avatar/Kenji.svg?season=1&crown=1");
  expect(avatar.headers()["content-type"]).toContain("image/svg+xml");
  expect(await avatar.text()).toMatch(/^<svg[^>]+viewBox="0 0 32 32"/);
  expect((await page.request.get("/avatar/nobody_here.svg")).status()).toBe(404);
  expect((await page.request.get("/avatar/kenji.png")).status()).toBe(404);
});
