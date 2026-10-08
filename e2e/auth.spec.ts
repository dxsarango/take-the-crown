import { type Page, expect, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";
import { clearMail, latestSignInLink, signInByEmail } from "./fixtures/mail";
import { acceptDelivery } from "./fixtures/payment";
import { SITE, SITE_HOST } from "./fixtures/site";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => seedKingdom());
test.afterAll(resetKingdom);
test.beforeEach(clearMail);

const visible = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
const signInButton = (page: Page) => page.getByRole("button", { name: en.home.signin }).filter({ visible: true });
const loginDialog = (page: Page) => page.getByRole("dialog");
const accountMenu = (page: Page) => page.getByRole("button", { name: en.login.accountMenu });

async function expectProfileLink(page: Page, href: string) {
  await accountMenu(page).click();
  await expect(page.getByRole("menuitem", { name: en.login.viewProfile })).toHaveAttribute("href", href);
  await page.keyboard.press("Escape");
}

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
  await expectProfileLink(page, "/en/u/kenji");
  const [row] = await sql<{ claimed: boolean }>("select user_id is not null as claimed from profiles where name = 'kenji'");
  expect(row.claimed).toBe(true);
});

test("keeps the session in cookies scripts cannot read", async ({ page }) => {
  await signInByEmail(page, "kenji@test.local", "/en");
  await page.waitForLoadState("networkidle");
  const session = (await page.context().cookies()).filter((c) => c.name.startsWith("sb-"));
  expect(session.length).toBeGreaterThan(0);
  for (const cookie of session) expect(cookie, cookie.name).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");
  // Still signed in: the server reads them.
  expect(((await (await page.request.get("/api/me")).json()) as { viewer: unknown }).viewer).not.toBeNull();
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

  // X stays off in the local stack until its OAuth app exists.
  const probe = await page.request.get("http://127.0.0.1:54321/auth/v1/authorize?provider=x", { maxRedirects: 0 });
  test.skip(probe.status() === 302, "X (OAuth 2.0) is enabled in local Supabase");
  await loginDialog(page).getByRole("link", { name: en.login.x }).click();
  await page.waitForURL(/\/en$/);
  await expect(loginDialog(page).getByText(en.login.errUnavailable)).toBeVisible();
});

test("hands Google sign-in to Supabase Auth with a PKCE challenge", async ({ page }) => {
  const settings = await (await page.request.get("http://127.0.0.1:54321/auth/v1/settings", {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
  })).json();
  test.skip(settings.external?.google !== true, "Google is not enabled in local Supabase");

  const response = await page.request.get("/auth/sign-in/google?next=%2Fen", { maxRedirects: 0 });
  const location = new URL(response.headers().location);
  expect(location.pathname).toBe("/auth/v1/authorize");
  expect(location.searchParams.get("provider")).toBe("google");
  expect(location.searchParams.get("code_challenge")).toBeTruthy();
  expect(location.searchParams.get("redirect_to")).toBe(`${SITE}/auth/callback?next=%2Fen`);
});

test("hands X sign-in to Supabase's OAuth 2.0 provider, asking for the email", async ({ page }) => {
  // Runs when the local stack has X on (`[auth.external.x]`, any client id): Supabase's authorize
  // endpoint redirects to X only for an enabled provider.
  const probe = await page.request.get("http://127.0.0.1:54321/auth/v1/authorize?provider=x", { maxRedirects: 0 });
  test.skip(probe.status() !== 302, "X (OAuth 2.0) is not enabled in local Supabase");

  const start = await page.request.get("/auth/sign-in/x?next=%2Fen", { maxRedirects: 0 });
  const authorize = new URL(start.headers().location);
  expect(authorize.pathname).toBe("/auth/v1/authorize");
  expect(authorize.searchParams.get("provider")).toBe("x");
  expect(authorize.searchParams.get("code_challenge")).toBeTruthy();

  const toX = new URL((await page.request.get(authorize.href, { maxRedirects: 0 })).headers().location);
  expect(`${toX.host}${toX.pathname}`).toBe("x.com/i/oauth2/authorize");
  expect(toX.searchParams.get("scope")?.split(" ")).toEqual(expect.arrayContaining(["users.email", "users.read"]));
});

test("a password someone set through Supabase's sign-up API stops working once the owner signs in", async ({ page, request }) => {
  // The app has no password sign-in, but Supabase's sign-up API is open to anyone with the anon key.
  const auth = "http://127.0.0.1:54321/auth/v1";
  const headers = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", "content-type": "application/json" };
  const email = "hijack.target@test.local";
  const password = "chosen-by-someone-else";
  const signUp = await request.post(`${auth}/signup`, { headers, data: { email, password } });
  expect(signUp.ok()).toBe(true);
  const attacker = await request.post(`${auth}/token?grant_type=password`, { headers, data: { email, password } });
  const { refresh_token: refreshToken } = (await attacker.json()) as { refresh_token: string };
  expect(refreshToken).toBeTruthy();

  // The owner signs in with a magic link, as players do.
  await signInByEmail(page, email, "/en");
  await expect(accountMenu(page)).toBeVisible();

  // The password no longer works and the session opened with it is gone.
  const again = await request.post(`${auth}/token?grant_type=password`, { headers, data: { email, password } });
  expect(again.status()).toBe(400);
  const refresh = await request.post(`${auth}/token?grant_type=refresh_token`, { headers, data: { refresh_token: refreshToken } });
  expect(refresh.ok()).toBe(false);
  // The owner is still signed in.
  expect(((await (await page.request.get("/api/me")).json()) as { viewer: unknown }).viewer).not.toBeNull();
});

test("refuses a session opened with a password", async ({ page, context, request }) => {
  const auth = "http://127.0.0.1:54321/auth/v1";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const email = "password.session@test.local";
  const password = "chosen-by-someone-else";
  expect((await request.post(`${auth}/signup`, { headers: { apikey: anonKey, "content-type": "application/json" }, data: { email, password } })).ok()).toBe(true);

  // The same cookies a browser would hold after signing in with that password.
  const jar: { name: string; value: string }[] = [];
  const supabase = createServerClient("http://127.0.0.1:54321", anonKey, {
    cookies: {
      getAll: () => jar,
      setAll: (list: { name: string; value: string }[]) => {
        jar.splice(0, jar.length, ...list.map(({ name, value }) => ({ name, value })));
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  expect(jar.length).toBeGreaterThan(0);
  await context.addCookies(jar.map(({ name, value }) => ({ name, value, url: SITE })));

  const me = (await (await page.request.get("/api/me")).json()) as { viewer: unknown };
  expect(me.viewer).toBeNull();
  // Signed out on the server: the cookies are gone, and no profile was claimed for that email.
  expect((await context.cookies()).filter((c) => c.name.startsWith("sb-") && c.value)).toEqual([]);
  expect(await sql("select 1 from profile_private where email = $1", [email])).toEqual([]);
});

test("comes back with an error when the callback fails", async ({ page }) => {
  await page.goto("/auth/callback?next=%2Fen&error=access_denied");
  await page.waitForURL(/\/en$/);
  await expect(loginDialog(page).getByText(en.login.errFailed)).toBeVisible();
});

test("never redirects outside the site after signing in", async ({ page }) => {
  const response = await page.request.get("/auth/callback?next=//evil.example", { maxRedirects: 0 });
  const location = new URL(response.headers().location);
  expect(location.host).toBe(SITE_HOST);
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

test("signs out from the account menu with the keyboard and stays on the page", async ({ page }, info) => {
  await signInByEmail(page, "jules@test.local", "/en/kingdom");
  const button = accountMenu(page);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitem", { name: en.login.viewProfile })).toBeFocused();
  await page.screenshot({ path: `test-results/screens/account-menu-${info.project.name}.png` });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(button).toBeFocused();

  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: en.login.signOut })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/en\/kingdom$/);
  await expect(signInButton(page)).toBeVisible();
  expect((await page.context().cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);
  const me = await (await page.request.get("/api/me")).json();
  expect(me.viewer).toBeNull();
});

test("opens edit profile from the account menu", async ({ page }) => {
  await signInByEmail(page, "jules@test.local", "/en");
  await accountMenu(page).click();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: en.login.editProfile })).toBeFocused();
  await page.getByRole("menuitem", { name: en.login.editProfile }).click();
  await page.waitForURL(/\/en\/settings\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: en.editProfile.title })).toBeVisible();
});

for (const locale of ["en", "es"] as const) {
  test(`closes the account menu when clicking outside ${locale}`, async ({ page }, info) => {
    const messages = { en, es }[locale];
    await signInByEmail(page, "jules@test.local", `/${locale}`);
    await page.getByRole("button", { name: messages.login.accountMenu }).click();
    const menu = page.getByRole("menu");
    for (const key of ["viewProfile", "editProfile", "signOut"] as const) {
      await expect(menu.getByRole("menuitem", { name: messages.login[key] })).toBeVisible();
    }
    await page.screenshot({ path: `test-results/screens/account-menu-${locale}-${info.project.name}.png` });
    await page.mouse.click(5, 400);
    await expect(menu).toHaveCount(0);
  });
}

test("a signed-in buyer keeps their name and skips the email field", async ({ page }) => {
  await signInByEmail(page, "sorenh@test.local", "/en");
  await page.getByRole("button", { name: /^Take the crown for/ }).filter({ visible: true }).click();
  const modal = page.getByRole("dialog");
  const name = modal.getByLabel(en.common.nameL, { exact: true }).filter({ visible: true });
  await expect(name).toHaveValue("sorenh");
  await expect(name).toHaveAttribute("readonly", "");
  await expect(modal.getByLabel(en.login.emailL, { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(visible(page, en.payment.nameSignedIn)).toBeVisible();

  await acceptDelivery(modal);
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
  await acceptDelivery(modal);
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
  await expectProfileLink(page, "/en/u/fresh_guest");
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

test("a session whose user was deleted ends cleanly instead of failing", async ({ page, context }) => {
  await signInByEmail(page, "vanished@test.local", "/en");
  await expect(page.getByRole("button", { name: en.home.signin }).filter({ visible: true })).toHaveCount(0);
  const authCookies = async () => (await context.cookies()).filter((c) => c.name.includes("auth-token"));
  expect((await authCookies()).length).toBeGreaterThan(0);

  // The account is gone on the server while the browser still holds its session.
  await sql("delete from auth.users where email = 'vanished@test.local'");
  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(200);
  expect(await me.json()).toEqual({ viewer: null });
  expect(await authCookies()).toEqual([]);

  await page.goto("/en");
  await expect(signInButton(page)).toBeVisible();
});
