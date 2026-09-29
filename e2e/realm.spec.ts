import { type Page, expect, test } from "@playwright/test";
import en from "../messages/en.json";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";
import { signInByEmail } from "./fixtures/mail";

const SCREENS = "test-results/screens";
const shown = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();

test.describe.configure({ mode: "serial" });
test.afterAll(resetKingdom);

async function screenshot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SCREENS}/${name}-${test.info().project.name}.png`, fullPage: true });
}

async function event(kind: string, profile: string, payload: object) {
  await sql(
    "insert into events (kind, season_id, profile_id, payload) select $1::event_kind, 0, id, $3 from profiles where name = $2",
    [kind, profile, JSON.stringify(payload)],
  );
}

test.describe("kingdom history", () => {
  test.beforeAll(() => seedKingdom());

  test("lists the season's reigns by day, sized by length", async ({ page }) => {
    await page.goto("/en/kingdom");
    await expect(page.getByRole("heading", { level: 1, name: en.realm.histTitle })).toBeVisible();
    const entries = page.getByTestId("history-entry");
    await expect(entries.first()).toContainText("valeruiz");
    await expect(entries.first()).toContainText(en.realm.now);
    await expect(entries.nth(1)).toContainText("Dethroned by ");
    await expect(page.getByRole("heading", { level: 2, name: /^Today · / })).toBeVisible();
    await expect(shown(page, "Built a budget app for freelancers in Latam. Free for the first 1,000 users.")).toBeVisible();
    // 13 old reigns by kenji + theo's record + 10 in the succession + the king.
    await expect(entries).toHaveCount(25);
    await expect(page.getByRole("button", { name: en.realm.earlier })).toHaveCount(0);
    await expect(shown(page, /^Season 0: Genesis began on /)).toBeVisible();
  });

  test("loads earlier reigns a page at a time", async ({ page }) => {
    await sql(`
      insert into reigns (season_id, profile_id, price_paid_cents, name, country_code, started_at, ended_at, end_reason)
      select 0, p.id, 500, p.name, p.country_code, now() - make_interval(hours => 500 + g), now() - make_interval(hours => 500 + g) + interval '5 minutes', 'dethroned'
      from profiles p, generate_series(1, 10) g where p.name = 'jules'`);
    await page.goto("/en/kingdom");
    const entries = page.getByTestId("history-entry");
    await expect(entries).toHaveCount(30);
    // The button is server-rendered: a click before hydration has no handler yet.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: en.realm.earlier }).filter({ visible: true }).click();
    await expect(entries).toHaveCount(35);
    await expect(page.getByRole("button", { name: en.realm.earlier })).toHaveCount(0);
  });

  test("offers the next season but not before it starts", async ({ page }) => {
    await page.goto("/en/kingdom");
    const next = page.locator('[aria-disabled="true"]').filter({ hasText: "Season 1" }).filter({ visible: true });
    await expect(next).toBeVisible();
    const response = await page.goto("/en/kingdom?season=day-of-the-dead");
    expect(response?.status()).toBe(404);
  });

  test("renders times in the reader's zone once it is known, with no switch", async ({ browser }) => {
    const [king] = await sql<{ started_at: Date }>(
      "select r.started_at from reigns r join crown_state s on s.current_reign_id = r.id",
    );
    const at = (timeZone: string) =>
      new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(king.started_at);
    const context = await browser.newContext({ timezoneId: "Asia/Tokyo", viewport: test.info().project.use.viewport });
    const page = await context.newPage();
    const firstEntry = (html: string) => /data-testid="history-entry"[\s\S]*?font-pixel[^>]*>(\d\d:\d\d)</.exec(html)?.[1];

    // First visit: the server does not know the zone yet and renders UTC.
    const first = await page.request.get("/en/kingdom");
    expect(firstEntry(await first.text())).toBe(at("UTC"));
    await page.goto("/en/kingdom");
    await expect(page.getByTestId("history-entry").first()).toContainText(at("Asia/Tokyo"));
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "tz")?.value).toBe(encodeURIComponent("Asia/Tokyo"));

    // Returning visit: the server renders the reader's zone, the same the browser shows.
    const again = await page.request.get("/en/kingdom");
    expect(firstEntry(await again.text())).toBe(at("Asia/Tokyo"));
    await context.close();
  });

  test("screenshot kingdom history", async ({ page }) => {
    await seedKingdom();
    await page.goto("/en/kingdom");
    await screenshot(page, "kingdom-en");
    await page.goto("/es/kingdom");
    await screenshot(page, "kingdom-es");
  });
});

test.describe("hall of fame", () => {
  test.beforeAll(() => seedKingdom());

  test("shows the four records with a podium", async ({ page }) => {
    await page.goto("/en/hall-of-fame");
    await expect(page.getByRole("heading", { level: 1, name: en.realm.hofTitle })).toBeVisible();
    await expect(shown(page, en.realm.tabSubs[0])).toBeVisible();
    await expect(shown(page, "31h 07m")).toBeVisible();

    await page.getByRole("tab", { name: en.realm.tabs[1] }).click();
    await expect(shown(page, en.realm.tabSubs[1])).toBeVisible();
    const podium = page.locator("ol").filter({ visible: true }).first();
    await expect(podium).toContainText("kenji");
    await expect(podium).toContainText("14");

    await page.getByRole("tab", { name: en.realm.tabs[2] }).click();
    await expect(podium).toContainText("lucas.fm");
    await expect(podium).toContainText("38s");

    await page.getByRole("tab", { name: en.realm.tabs[3] }).click();
    await expect(podium).toContainText("Japan");
  });

  test("explains all time while only one season has started", async ({ page }) => {
    await page.goto("/en/hall-of-fame");
    await page.getByRole("radio", { name: en.realm.scopes[1] }).click();
    await expect(shown(page, /^Season 0 is the first season, so all-time records match it until Season 1 starts on /)).toBeVisible();
  });

  for (const locale of ["en", "es"] as const) {
    test(`screenshot hall of fame ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}/hall-of-fame`);
      await screenshot(page, `hall-${locale}`);
    });
  }
});

test.describe("season end", () => {
  test.beforeAll(() => seedKingdom({ season: 1 }));

  test("crowns the King of the Season and announces the next one", async ({ page }) => {
    await page.goto("/en/seasons/genesis");
    await expect(page.getByRole("heading", { level: 1, name: "Season 0: Genesis has ended" }).filter({ visible: true })).toBeVisible();
    await expect(shown(page, en.realm.kos)).toBeVisible();
    await expect(page.getByRole("link", { name: "theo_builds" }).filter({ visible: true }).first()).toBeVisible();
    await expect(shown(page, "Season 0 in numbers")).toBeVisible();
    if (test.info().project.name === "desktop") {
      await expect(shown(page, /^theo_builds held the throne for 170h 00m across 1 reign this season\. Their portrait stays in the hall forever\.$/)).toBeVisible();
    }
    await expect(shown(page, "Season 1: Day of the Dead")).toBeVisible();
    // Season 1 is already under way, so there is nothing to be reminded of.
    await expect(page.getByRole("link", { name: en.realm.goThrone }).filter({ visible: true })).toBeVisible();
  });

  test("reminds a signed-in player when the next season starts", async ({ page }) => {
    await page.goto("/en/seasons/day-of-the-dead");
    await expect(shown(page, en.realm.leading)).toBeVisible();
    await page.getByRole("button", { name: en.realm.remind }).filter({ visible: true }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: en.login.head })).toBeVisible();

    await signInByEmail(page, "kenji@test.local", "/en/seasons/day-of-the-dead");
    await expect(page.getByRole("link", { name: en.login.yourProfile })).toBeVisible();
    await page.getByRole("button", { name: en.realm.remind }).filter({ visible: true }).click();
    await expect(shown(page, en.realm.reminded)).toBeVisible();
    const [row] = await sql("select alerts_season_start from profile_private where email = 'kenji@test.local'");
    expect(row.alerts_season_start).toBe(true);
  });

  test("has no page for seasons that have not started", async ({ page }) => {
    expect((await page.goto("/en/seasons/frost"))?.status()).toBe(404);
    expect((await page.goto("/en/seasons/nope"))?.status()).toBe(404);
  });

  for (const locale of ["en", "es"] as const) {
    test(`screenshot season end ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}/seasons/genesis`);
      await screenshot(page, `season-end-${locale}`);
    });
  }
});

test.describe("unlocks", () => {
  test.beforeAll(() => seedKingdom());

  test("shows the player's own achievements and rank-ups, one at a time", async ({ page }) => {
    await signInByEmail(page, "kenji@test.local", "/en");
    await expect(page.getByRole("link", { name: en.login.yourProfile })).toBeVisible();
    // Let the realtime channel subscribe.
    await page.waitForTimeout(1500);

    await event("achievement_unlocked", "valeruiz", { code: "patriot" });
    await event("achievement_unlocked", "kenji", { code: "regicide" });
    await event("rank_up", "kenji", { rank: "duke" });

    const toast = page.getByTestId("unlock-toast");
    await expect(toast).toContainText(en.achievement.unlocked, { timeout: 10_000 });
    await expect(toast).toContainText("Regicide");
    await expect(toast).toContainText("Dethroned a king who reigned over 24h.");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SCREENS}/toast-${test.info().project.name}.png` });

    await toast.getByRole("button", { name: en.common.close }).click();
    await expect(toast).toContainText(en.achievement.rankUp, { timeout: 5_000 });
    await expect(toast).toContainText("Duke");
    await toast.getByRole("button", { name: en.common.close }).click();
    await expect(toast).toHaveCount(0, { timeout: 3_000 });
    // valeruiz's unlock never showed up here.
    await expect(page.getByText(en.medals.patriot.name).filter({ visible: true })).toHaveCount(0);
  });

  test("pauses while hovered", async ({ page }) => {
    await signInByEmail(page, "kenji@test.local", "/en");
    await page.waitForTimeout(1500);
    await event("achievement_unlocked", "kenji", { code: "night_owl" });
    const toast = page.getByTestId("unlock-toast");
    await expect(toast).toContainText("Night Owl", { timeout: 10_000 });
    await toast.hover();
    await page.waitForTimeout(7000);
    await expect(toast).toBeVisible();
  });

  test("fades in without movement for reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: test.info().project.use.viewport });
    const page = await context.newPage();
    await signInByEmail(page, "kenji@test.local", "/en");
    await page.waitForTimeout(1500);
    await event("achievement_unlocked", "kenji", { code: "founder" });
    const toast = page.getByTestId("unlock-toast");
    await expect(toast).toContainText("Founder", { timeout: 10_000 });
    await expect(toast.locator('img[src*="founder-on"]')).toHaveAttribute("width", "72");
    await expect(toast).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    await context.close();
  });

  test("announces rank-ups in the proclamations", async ({ page }) => {
    await event("rank_up", "mbali", { rank: "count" });
    await page.goto("/en");
    await expect(shown(page, "rose to")).toBeVisible();
  });
});
