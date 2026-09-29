import { type Page, expect, test } from "@playwright/test";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";
import { clearMail, latestSignInLink, signInByEmail } from "./fixtures/mail";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => seedKingdom());
test.afterAll(resetKingdom);
test.beforeEach(clearMail);

const visible = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
const signInButton = (page: Page) => page.getByRole("button", { name: en.home.signin }).filter({ visible: true });
const loginDialog = (page: Page) => page.getByRole("dialog");

test("signs in with a magic link and claims the guest profile bought with that email", async ({ page }) => {
  await page.goto("/en");
  await signInButton(page).click();
  const dialog = loginDialog(page);
  await expect(dialog.getByRole("heading", { name: en.login.head })).toBeVisible();

  await dialog.getByLabel(en.login.emailL).fill("kenji@test.local");
  await dialog.getByRole("button", { name: en.login.magic }).click();
  await expect(dialog.getByRole("heading", { name: en.login.sentHead })).toBeVisible();
  await expect(dialog.getByText("kenji@test.local")).toBeVisible();
  await expect(dialog.getByText(/Resend in 0:\d\d/)).toBeVisible();

  await page.goto(await latestSignInLink("kenji@test.local"));
  await page.waitForURL(/\/en$/);
  await expect(page.getByRole("link", { name: en.login.yourProfile })).toHaveAttribute("href", "/en/u/kenji");
  const [row] = await sql<{ claimed: boolean }>("select user_id is not null as claimed from profiles where name = 'kenji'");
  expect(row.claimed).toBe(true);
});

test("marks a mistyped email", async ({ page }) => {
  await page.goto("/en");
  await signInButton(page).click();
  await loginDialog(page).getByLabel(en.login.emailL).fill("kenji@nowhere");
  await loginDialog(page).getByRole("button", { name: en.login.magic }).click();
  await expect(loginDialog(page).getByText(en.login.emailBad)).toBeVisible();
  await expect(loginDialog(page).getByLabel(en.login.emailL)).toHaveAttribute("aria-invalid", "true");
});

test("starts Google and X sign-in, and explains when a provider is off", async ({ page }) => {
  await page.goto("/en");
  await signInButton(page).click();
  await expect(loginDialog(page).getByRole("link", { name: en.common.google })).toHaveAttribute("href", "/auth/sign-in/google?next=%2Fen");
  await expect(loginDialog(page).getByRole("link", { name: en.login.x })).toHaveAttribute("href", "/auth/sign-in/x?next=%2Fen");

  // Providers are off in the local stack until the OAuth apps exist.
  await loginDialog(page).getByRole("link", { name: en.common.google }).click();
  await page.waitForURL(/\/en$/);
  await expect(loginDialog(page).getByText(en.login.errUnavailable)).toBeVisible();
});

test("comes back with an error when the callback fails", async ({ page }) => {
  await page.goto("/auth/callback?next=%2Fen&error=access_denied");
  await page.waitForURL(/\/en$/);
  await expect(loginDialog(page).getByText(en.login.errFailed)).toBeVisible();
});

test("never redirects outside the site after signing in", async ({ page }) => {
  const response = await page.request.get("/auth/callback?next=//evil.example", { maxRedirects: 0 });
  const location = new URL(response.headers().location);
  expect(location.host).toBe("localhost:3000");
  expect(location.pathname).toBe("/");
});

test("sends signed-out players to sign in before editing their profile", async ({ page }) => {
  await page.goto("/en/settings/profile");
  await page.waitForURL(/\/en$/);
  await expect(loginDialog(page).getByRole("heading", { name: en.login.head })).toBeVisible();

  await loginDialog(page).getByLabel(en.login.emailL).fill("mbali@test.local");
  await loginDialog(page).getByRole("button", { name: en.login.magic }).click();
  await expect(loginDialog(page).getByRole("heading", { name: en.login.sentHead })).toBeVisible();
  await page.goto(await latestSignInLink("mbali@test.local"));
  await page.waitForURL(/\/en\/settings\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: en.editProfile.title })).toBeVisible();
});

test("signs out from edit profile", async ({ page }) => {
  await signInByEmail(page, "jules@test.local", "/en/settings/profile");
  await page.getByRole("button", { name: en.login.signOut }).filter({ visible: true }).click();
  await page.waitForURL(/\/en$/);
  await expect(signInButton(page)).toBeVisible();
  const me = await (await page.request.get("/api/me")).json();
  expect(me.viewer).toBeNull();
});

test("a signed-in buyer keeps their name and skips the email field", async ({ page }) => {
  await signInByEmail(page, "sorenh@test.local", "/en");
  await page.getByRole("button", { name: /^Take the crown for/ }).filter({ visible: true }).click();
  const modal = page.getByRole("dialog");
  const name = modal.getByLabel(en.common.nameL, { exact: true }).filter({ visible: true });
  await expect(name).toHaveValue("sorenh");
  await expect(name).toHaveAttribute("readonly", "");
  await expect(modal.getByLabel(en.login.emailL, { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(visible(page, en.payment.nameSignedIn)).toBeVisible();

  await modal.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await modal.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await expect(visible(page, en.payment.headOk)).toBeVisible({ timeout: 10_000 });
  // Already signed in: no sign-in prompt after paying.
  await expect(modal.getByRole("link", { name: en.common.google })).toHaveCount(0);
  const [reign] = await sql<{ name: string }>(
    "select p.name from reigns r join crown_state s on s.current_reign_id = r.id join profiles p on p.id = r.profile_id",
  );
  expect(reign.name).toBe("sorenh");
});

test("asks a guest to sign in after paying, with their email ready", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: /^Take the crown for/ }).filter({ visible: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel(en.common.nameL, { exact: true }).filter({ visible: true }).fill("fresh_guest");
  await modal.getByLabel(en.login.emailL, { exact: true }).filter({ visible: true }).fill("fresh.guest@test.local");
  await expect(visible(page, en.payment.nameAvailable)).toBeVisible();
  await modal.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await modal.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
  await expect(visible(page, en.payment.headOk)).toBeVisible({ timeout: 10_000 });

  await expect(modal.getByRole("link", { name: en.common.google }).filter({ visible: true })).toBeVisible();
  await modal.getByRole("button", { name: en.payment.email }).filter({ visible: true }).click();
  const login = page.getByRole("dialog").filter({ hasText: en.login.kicker });
  await expect(login).toBeVisible();
  await expect(login.getByLabel(en.login.emailL)).toHaveValue("fresh.guest@test.local");
  await expect(login.getByRole("button", { name: en.common.notNow })).toBeVisible();
  await page.screenshot({ path: `test-results/screens/login-after-payment-${test.info().project.name}.png` });

  await login.getByRole("button", { name: en.login.magic }).click();
  await page.goto(await latestSignInLink("fresh.guest@test.local"));
  await page.waitForURL(/\/en$/);
  await expect(page.getByRole("link", { name: en.login.yourProfile })).toHaveAttribute("href", "/en/u/fresh_guest");
});

for (const locale of ["en", "es"] as const) {
  test(`screenshots of the sign-in sheet ${locale}`, async ({ page }, info) => {
    await page.goto(`/${locale}`);
    const messages = { en, es }[locale];
    await page.getByRole("button", { name: messages.home.signin }).filter({ visible: true }).click();
    await expect(loginDialog(page).getByRole("heading")).toBeVisible();
    await page.screenshot({ path: `test-results/screens/login-${locale}-${info.project.name}.png` });
    await loginDialog(page).getByLabel(messages.login.emailL).fill("screens@test.local");
    await loginDialog(page).getByRole("button", { name: messages.login.magic }).click();
    await expect(loginDialog(page).getByRole("heading", { name: messages.login.sentHead })).toBeVisible();
    await page.screenshot({ path: `test-results/screens/login-sent-${locale}-${info.project.name}.png` });
  });
}
