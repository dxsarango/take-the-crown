import { type Page, expect, test } from "@playwright/test";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { passTwoStep, signInAsAdmin, totp } from "./fixtures/admin";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";
import { clearMail, latestSignInLink, signInByEmail } from "./fixtures/mail";

/** Admin session policy (decision 49): a recent sign-in, TOTP two-step verification, re-authentication for sensitive actions. */

test.describe.configure({ mode: "serial" });
test.beforeEach(() => seedKingdom());
test.afterAll(resetKingdom);

const ADMIN = "kenji@test.local";
const SCREENS = "test-results/screens";
const security = en.admin.security;
const heading = (page: Page) => page.getByRole("heading", { level: 1 });

/** Moves this admin's current sessions' sign-in back in time. */
async function signedInAgo(interval: string) {
  await sql("update auth.sessions set created_at = now() - $1::interval where user_id = (select id from auth.users where email = $2)", [interval, ADMIN]);
}

test("an admin sets up TOTP on the first visit and needs a code on every new sign-in", async ({ page }, info) => {
  await sql("update profile_private set is_admin = true where email = $1", [ADMIN]);
  await signInByEmail(page, ADMIN, "/en/admin");
  await expect(heading(page)).toHaveText(security.enrollHead);
  // Nothing of the panel is served before the second factor.
  await expect(page.getByRole("heading", { name: en.admin.nav.config })).toHaveCount(0);

  await page.getByRole("button", { name: security.enrollStart }).click();
  await expect(page.getByRole("img", { name: security.qrAlt })).toBeVisible();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.screenshot({ path: `${SCREENS}/admin-totp-enroll-${info.project.name}.png` });
  const wrong = String((Number(totp(secret)) + 1) % 1_000_000).padStart(6, "0");
  await page.getByLabel(security.codeL).fill(wrong);
  await page.getByRole("button", { name: security.verify }).click();
  await expect(page.getByRole("alert").filter({ hasText: security.codeBad })).toBeVisible();
  // A typo keeps the same QR code and setup key on screen.
  await expect(page.getByTestId("totp-secret")).toHaveText(secret);
  await page.getByLabel(security.codeL).fill(totp(secret));
  await page.getByRole("button", { name: security.verify }).click();
  await expect(heading(page)).toHaveText(en.admin.title);
  const [factors] = await sql<{ n: number }>(
    "select count(*)::int as n from auth.mfa_factors f join auth.users u on u.id = f.user_id where u.email = $1 and f.status = 'verified'",
    [ADMIN],
  );
  expect(factors.n).toBe(1);
  // The wrong code and the enrollment are in the admin log.
  expect((await sql<{ action: string }>("select action from admin_actions where action like 'mfa_%' order by id")).map((r) => r.action)).toEqual([
    "mfa_failed",
    "mfa_enrolled",
  ]);

  // A sign-in on another device (no cookies) must answer the challenge; no second enrollment.
  await page.context().clearCookies();
  await signInByEmail(page, ADMIN, "/en/admin");
  await expect(heading(page)).toHaveText(security.verifyHead);
  await page.screenshot({ path: `${SCREENS}/admin-totp-verify-${info.project.name}.png` });
  await page.getByLabel(security.codeL).fill(totp(secret));
  await page.getByRole("button", { name: security.verify }).click();
  await expect(heading(page)).toHaveText(en.admin.title);
});

test("a sign-in older than 12 hours sends the admin back through a sign-in link", async ({ page }, info) => {
  await signInAsAdmin(page, ADMIN);
  await signedInAgo("13 hours");
  await page.goto("/en/admin");
  await expect(heading(page)).toHaveText(security.staleHead);
  await expect(page.getByRole("heading", { name: en.admin.nav.config })).toHaveCount(0);
  await page.screenshot({ path: `${SCREENS}/admin-stale-${info.project.name}.png` });

  await clearMail();
  await sql("delete from rate_limit_hits where key like 'magic_link%'");
  await page.getByRole("button", { name: security.sendLink }).click();
  await expect(page.getByRole("status").filter({ hasText: /./ }).first()).toHaveText(security.linkSent.replace("{email}", ADMIN));
  await page.goto(await latestSignInLink(ADMIN));
  await page.waitForURL(/\/en\/admin$/);
  // The link starts a new session, which answers the TOTP challenge again.
  await passTwoStep(page, ADMIN);
});

test("sensitive actions need a sign-in from the last 10 minutes", async ({ page }) => {
  await signInAsAdmin(page, ADMIN);
  await signedInAgo("11 minutes");
  const [before] = await sql<{ floor_cents: number }>("select floor_cents from app_config");
  await page.goto("/en/admin#config");
  const config = page.locator("#config");
  await config.getByLabel(en.admin.config.floor_cents).fill(String(before.floor_cents + 100));
  await clearMail();
  await sql("delete from rate_limit_hits where key like 'magic_link%'");
  await config.getByRole("button", { name: en.admin.config.save }).click();

  await expect(page.getByRole("status").filter({ hasText: /./ }).first()).toHaveText(security.reauth.replace("{minutes}", "10").replace("{email}", ADMIN));
  const [after] = await sql<{ floor_cents: number }>("select floor_cents from app_config");
  expect(after.floor_cents).toBe(before.floor_cents);
  expect(await sql("select 1 from admin_actions where action = 'config'")).toEqual([]);

  // The link brings the admin back to the section; after the code the same action goes through.
  await page.goto(await latestSignInLink(ADMIN));
  await page.waitForURL(/\/en\/admin#config$/);
  await passTwoStep(page, ADMIN);
  await page.goto("/en/admin#config");
  await config.getByLabel(en.admin.config.floor_cents).fill(String(before.floor_cents + 100));
  await config.getByRole("button", { name: en.admin.config.save }).click();
  await expect(page.getByRole("status").filter({ hasText: /./ }).first()).toHaveText(en.admin.done);
  const [saved] = await sql<{ floor_cents: number }>("select floor_cents from app_config");
  expect(saved.floor_cents).toBe(before.floor_cents + 100);
});

test("a non-admin still gets a plain 404", async ({ page }) => {
  await signInByEmail(page, "jules@test.local", "/en");
  expect((await page.goto("/en/admin"))?.status()).toBe(404);
});

for (const locale of ["en", "es"] as const) {
  test(`screenshot two-step setup ${locale}`, async ({ page }, info) => {
    const messages = { en, es }[locale];
    await sql("update profile_private set is_admin = true where email = $1", [ADMIN]);
    await signInByEmail(page, ADMIN, `/${locale}/admin`);
    await expect(heading(page)).toHaveText(messages.admin.security.enrollHead);
    await page.getByRole("button", { name: messages.admin.security.enrollStart }).click();
    await expect(page.getByTestId("totp-secret")).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/admin-totp-enroll-${locale}-${info.project.name}.png`, fullPage: true });
  });
}
