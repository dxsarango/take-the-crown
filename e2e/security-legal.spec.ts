import { mkdir } from "node:fs/promises";
import { type Page, expect, test } from "@playwright/test";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";
import { signInByEmail } from "./fixtures/mail";
import { acceptDelivery } from "./fixtures/payment";

const SCREENS = "test-results/screens";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await mkdir(SCREENS, { recursive: true });
});
test.beforeEach(() => seedKingdom());
test.afterAll(resetKingdom);

const shown = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
const project = () => test.info().project.name;

/** Collects CSP violations the browser reports while the page runs. */
function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

test.describe("headers", () => {
  test("pages get a nonce CSP and every script carries the nonce", async ({ page }) => {
    const violations = watchCsp(page);
    const response = await page.goto("/en");
    const csp = response?.headers()["content-security-policy"] ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");

    // Every script the server writes into the page carries the nonce; scripts those load later are
    // trusted through 'strict-dynamic'.
    const html = (await response?.text()) ?? "";
    const tags = html.match(/<script[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain(`nonce="${nonce}"`);
    await page.waitForLoadState("networkidle");

    // A second load gets a new nonce.
    const again = await page.request.get("/en");
    expect(again.headers()["content-security-policy"]).not.toContain(`'nonce-${nonce}'`);

    // The page is interactive under the policy: the payment modal opens.
    await page.getByRole("button", { name: /Take the (crown|empty throne) for/ }).filter({ visible: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    for (const path of ["/es/kingdom", "/en/hall-of-fame", "/en/u/kenji", "/es/terms"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(violations).toEqual([]);
  });

  test("every response carries the security headers", async ({ request }) => {
    for (const path of ["/en", "/api/time", "/og/flag/JP.png", "/art/seal/seal-t0.svg"]) {
      const headers = (await request.get(path)).headers();
      expect(headers["x-content-type-options"], path).toBe("nosniff");
      expect(headers["x-frame-options"], path).toBe("DENY");
      expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(headers["strict-transport-security"], path).toContain("max-age=63072000");
      expect(headers["permissions-policy"], path).toContain("camera=()");
      expect(headers["x-powered-by"], path).toBeUndefined();
    }
  });
});

test.describe("abuse limits", () => {
  test("sign-in links are limited per hour, and the dialog says so", async ({ page }) => {
    test.skip(project() !== "desktop", "server behaviour");
    await sql("update app_config set max_magic_links_per_hour = 2");
    for (let i = 0; i < 2; i++) {
      expect((await page.request.post("/api/auth/magic-link", { data: { email: `limit${i}@test.local` } })).status()).toBe(200);
    }
    expect((await page.request.post("/api/auth/magic-link", { data: { email: "limit9@test.local" } })).status()).toBe(429);

    await page.goto("/en?login=1");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(en.login.emailL, { exact: true }).fill("limit3@test.local");
    await dialog.getByRole("button", { name: en.login.magic }).click();
    await expect(dialog.getByRole("alert")).toHaveText(en.login.errLimited);
  });

  test("reports are limited per IP across reigns", async ({ request }) => {
    test.skip(project() !== "desktop", "server behaviour");
    await sql("update app_config set max_reports_per_ip_per_hour = 2");
    await sql("update reigns set message = 'Reportable' where id in (select id from reigns order by id limit 3)");
    const reigns = await sql<{ id: string }>("select id from reigns order by id limit 3");
    const report = (id: string) => request.post("/api/reports", { data: { reignId: Number(id), reason: "spam" } });
    expect((await report(reigns[0].id)).status()).toBe(200);
    expect((await report(reigns[1].id)).status()).toBe(200);
    expect((await report(reigns[2].id)).status()).toBe(429);
  });

  test("cookie-authenticated routes refuse other origins", async ({ request }) => {
    test.skip(project() !== "desktop", "server behaviour");
    const evil = { origin: "https://evil.example" };
    expect((await request.post("/api/auth/magic-link", { headers: evil, data: { email: "x@test.local" } })).status()).toBe(403);
    expect((await request.post("/api/reports", { headers: evil, data: { reignId: 1, reason: "spam" } })).status()).toBe(403);
    expect((await request.patch("/api/profile", { headers: evil, data: {} })).status()).toBe(403);
    expect((await request.delete("/api/profile", { headers: evil, data: { confirmName: "kenji" } })).status()).toBe(403);
    expect((await request.post("/api/locks", { headers: evil, data: {} })).status()).toBe(403);
  });

  test("sign-in redirects stay on the site", async ({ request }) => {
    test.skip(project() !== "desktop", "server behaviour");
    for (const next of ["//evil.example", "/\t/evil.example", "/\\evil.example", "https://evil.example"]) {
      const response = await request.get(`/auth/callback?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
      expect(new URL(response.headers().location, "http://localhost:3000").host, next).toBe("localhost:3000");
    }
  });
});

test.describe("withdrawal acknowledgment", () => {
  test("checkout needs the box ticked, links the terms and records it", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: /Take the (crown|empty throne) for/ }).filter({ visible: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(en.common.nameL, { exact: true }).filter({ visible: true }).fill("careful_buyer");
    await dialog.getByLabel(en.login.emailL, { exact: true }).filter({ visible: true }).fill("careful@test.local");
    await expect(shown(page, en.payment.nameAvailable)).toBeVisible();

    // Without the box the button stays off and says why.
    await expect(shown(page, en.payment.needAck)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true })).toHaveCount(0);
    const terms = dialog.getByRole("link", { name: "terms" }).filter({ visible: true });
    await expect(terms).toHaveAttribute("href", "/en/terms#s5");
    await expect(terms).toHaveAttribute("target", "_blank");
    await page.screenshot({ path: `${SCREENS}/payment-ack-${project()}.png` });

    await acceptDelivery(dialog);
    await dialog.getByRole("button", { name: /^Pay \$/ }).filter({ visible: true }).click();
    await expect(page.getByTestId("test-checkout").filter({ visible: true })).toBeVisible();
    const [lock] = await sql<{ ack: boolean }>("select withdrawal_ack_at is not null as ack from price_locks where email = 'careful@test.local'");
    expect(lock.ack).toBe(true);
  });

  test("the server refuses a lock without it", async ({ request }) => {
    test.skip(project() !== "desktop", "server behaviour");
    const response = await request.post("/api/locks", {
      data: { name: "sneaky_buyer", email: "sneaky@test.local", locale: "en" },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "invalid_input", fields: ["acceptWithdrawal"] });
    expect(await sql("select 1 from price_locks where email = 'sneaky@test.local'")).toEqual([]);
  });
});

test.describe("legal pages", () => {
  test("render the four pages in both languages with the game's numbers", async ({ page }) => {
    await sql("update app_config set legal_contact_email = 'legal@crown.test', legal_city = 'Loja', legal_effective_date = '2026-11-01'");
    for (const [locale, messages, title] of [
      ["en", en, { rules: "Rules", faq: "FAQ", terms: "Terms of Service", privacy: "Privacy Policy" }],
      ["es", es, { rules: "Reglas", faq: "Preguntas frecuentes", terms: "Términos del servicio", privacy: "Política de privacidad" }],
    ] as const) {
      for (const doc of ["rules", "faq", "terms", "privacy"] as const) {
        await page.goto(`/${locale}/${doc}`);
        await expect(page.getByRole("heading", { level: 1, name: title[doc] })).toBeVisible();
        await expect(page.locator("footer").getByRole("link", { name: messages.home.privacy })).toBeVisible();
      }
    }

    await page.goto("/en/rules");
    await expect(shown(page, "The crown never costs less than $5.")).toBeVisible();
    await expect(shown(page, "the price drops 2% every hour")).toBeVisible();
    await page.goto("/es/terms");
    await expect(page.locator("#s5")).toHaveText("5. Entrega y reembolsos");
    await expect(page.getByRole("link", { name: "legal@crown.test" }).first()).toHaveAttribute("href", "mailto:legal@crown.test");
    await expect(shown(page, "jueces competentes de Loja, Ecuador")).toBeVisible();
    await expect(shown(page, "Fecha de vigencia: 1 de noviembre de 2026")).toBeVisible();
    // Details nobody filled in yet stay visible as placeholders.
    await expect(shown(page, "{{PAYMENT_PROVIDER}}")).toBeVisible();
  });

  for (const locale of ["en", "es"] as const) {
    test(`screenshot terms and FAQ ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}/terms`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${SCREENS}/legal-terms-${locale}-${project()}.png` });
      await page.goto(`/${locale}/faq`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${SCREENS}/legal-faq-${locale}-${project()}.png`, fullPage: true });
    });
  }
});

test.describe("account deletion", () => {
  test("anonymizes the player and keeps their reigns as Former king", async ({ page }) => {
    const [kenji] = await sql<{ id: string; reigns: number }>(
      "select p.id, (select count(*)::int from reigns where profile_id = p.id) as reigns from profiles p where p.name = 'kenji'",
    );
    expect(kenji.reigns).toBeGreaterThan(0);
    await signInByEmail(page, "kenji@test.local", "/en/settings/profile");
    await page.waitForLoadState("networkidle");

    await page.getByRole("main").getByRole("button", { name: en.editProfile.delButton }).click();
    const dialog = page.getByRole("dialog", { name: en.editProfile.delTitle });
    const confirm = dialog.getByRole("button", { name: en.editProfile.delConfirm });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(en.editProfile.delConfirmL.replace("{name}", "kenji")).fill("Kenji");
    await page.screenshot({ path: `${SCREENS}/delete-account-${project()}.png` });
    await confirm.click();
    await page.waitForURL((url) => url.pathname === "/en");
    await expect(page.getByRole("button", { name: en.home.signin }).filter({ visible: true }).first()).toBeVisible();

    const [profile] = await sql<{ name: string; deleted: boolean; reigns: number }>(
      "select name, deleted_at is not null as deleted, (select count(*)::int from reigns where profile_id = $1) as reigns from profiles where id = $1",
      [kenji.id],
    );
    expect(profile).toMatchObject({ deleted: true, reigns: kenji.reigns });
    expect(profile.name).toMatch(/^former~/);
    expect(await sql("select 1 from profile_private where profile_id = $1", [kenji.id])).toEqual([]);
    expect(await sql("select 1 from auth.users where email = 'kenji@test.local'")).toEqual([]);

    expect((await page.request.get("/en/u/kenji")).status()).toBe(404);
    await page.goto("/en/kingdom");
    await expect(shown(page, en.common.formerKing)).toBeVisible();
    await expect(page.getByRole("link", { name: "kenji", exact: true })).toHaveCount(0);
  });

  test("asks for the exact name before deleting", async ({ page }) => {
    test.skip(project() !== "desktop", "server behaviour");
    await signInByEmail(page, "kenji@test.local", "/en/settings/profile");
    const response = await page.request.delete("/api/profile", { data: { confirmName: "someone_else" } });
    expect(response.status()).toBe(400);
    expect(await sql("select 1 from profiles where name = 'kenji' and deleted_at is null")).toHaveLength(1);
  });
});
