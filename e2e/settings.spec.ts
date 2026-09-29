import { type Page, expect, test } from "@playwright/test";
import sharp from "sharp";
import en from "../messages/en.json";
import { sql } from "./fixtures/db";
import { signInByEmail } from "./fixtures/mail";
import { NEWCOMER, VETERAN, seedProfiles } from "./fixtures/profiles";
import { resetKingdom } from "./fixtures/kingdom";

const SCREENS = "test-results/screens";
const ep = en.editProfile;

test.describe.configure({ mode: "serial" });
test.beforeEach(seedProfiles);
test.afterAll(resetKingdom);

const shown = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
const saveButton = (page: Page) => page.getByRole("button", { name: /^Save( changes)?$/ }).filter({ visible: true });

async function openAs(page: Page, email: string) {
  await signInByEmail(page, email, "/en/settings/profile");
  await expect(page.getByRole("heading", { level: 1, name: ep.title }).filter({ visible: true })).toBeVisible();
  // Typing before hydration would be overwritten by the controlled inputs.
  await page.waitForLoadState("networkidle");
}

test("saves every section and shows it on the public profile", async ({ page }) => {
  await openAs(page, VETERAN.email);
  await expect(shown(page, ep.stClean)).toBeVisible();

  await page.getByRole("button", { name: `${ep.next}: ${ep.parts.hair}`, exact: true }).click();
  await page.getByLabel(en.common.countryL, { exact: true }).selectOption("EC");
  await page.getByLabel(ep.linkL, { exact: true }).fill("https://lumen-notes.app/launch");
  await page.getByLabel(en.social.tt.name, { exact: true }).fill("https://www.tiktok.com/@priya.ships");
  await page.getByLabel(en.social.x.name, { exact: true }).fill("");
  await page.getByRole("button", { name: `${en.medals.g2.name}, in showcase, position 2` }).click();
  await page.getByRole("switch", { name: ep.rival }).click();
  await page.getByRole("switch", { name: ep.price }).click();
  await page.getByLabel(ep.priceL, { exact: true }).fill("20");
  await page.getByRole("switch", { name: ep.season }).click();
  await expect(shown(page, "9 unsaved changes")).toBeVisible();

  await saveButton(page).click();
  await expect(shown(page, ep.bSavedTitle)).toBeVisible();
  await expect(shown(page, ep.stSaved)).toBeVisible();

  const [row] = await sql(
    `select p.country_code, p.main_link, p.link_tiktok, p.link_x, p.showcase, p.show_rival, p.avatar_traits is not null as traits,
       pp.alerts_price_below_cents, pp.alerts_season_start
     from profiles p join profile_private pp on pp.profile_id = p.id where p.name = $1`,
    [VETERAN.name],
  );
  expect(row).toEqual({
    country_code: "EC",
    main_link: "https://lumen-notes.app/launch",
    link_tiktok: "https://tiktok.com/@priya.ships",
    link_x: null,
    showcase: ["founder", "regicide"],
    show_rival: false,
    traits: true,
    alerts_price_below_cents: 2000,
    alerts_season_start: true,
  });

  await page.goto(`/en/u/${VETERAN.name}`);
  await expect(page.getByRole("link", { name: "TikTok: @priya.ships" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^X:/ })).toHaveCount(0);
});

test("lists every field to fix and saves nothing", async ({ page }) => {
  await openAs(page, VETERAN.email);
  await page.getByLabel(en.common.nameL, { exact: true }).fill("pr");
  await page.getByLabel(ep.linkL, { exact: true }).fill("lumen notes");
  await page.getByLabel(en.social.x.name, { exact: true }).fill("priya ships!");
  await page.getByRole("switch", { name: ep.price }).click();
  await page.getByLabel(ep.priceL, { exact: true }).fill("2");
  await saveButton(page).click();

  await expect(shown(page, "4 fields need fixing")).toBeVisible();
  await expect(shown(page, "4 fields to fix")).toBeVisible();
  await expect(shown(page, ep.nameShort)).toBeVisible();
  await expect(shown(page, en.social.x.invalid)).toBeVisible();
  await expect(shown(page, "Enter a whole number from 5 to 999.")).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/edit-errors-${test.info().project.name}.png` });

  // Jumping from the banner focuses the field.
  await page.getByRole("button", { name: new RegExp(`^${en.social.x.name}`) }).filter({ visible: true }).click();
  await expect(page.getByLabel(en.social.x.name, { exact: true })).toBeFocused();

  const [row] = await sql("select name, link_x from profiles where name = $1", [VETERAN.name]);
  expect(row).toEqual({ name: VETERAN.name, link_x: "https://x.com/priya_ships" });
});

test("checks the name as you type and after saving", async ({ page }) => {
  await openAs(page, NEWCOMER.email);
  await page.getByLabel(en.common.nameL, { exact: true }).fill("kenji");
  await expect(shown(page, "kenji is taken. Try another name.")).toBeVisible();

  await page.getByLabel(en.common.nameL, { exact: true }).fill("maru.prints");
  await saveButton(page).click();
  await expect(shown(page, ep.bSavedTitle)).toBeVisible();

  // The old name now points to the new one, and the name is locked for 30 days.
  await page.goto(`/en/u/${NEWCOMER.name}`);
  await expect(page).toHaveURL(/\/en\/u\/maru\.prints$/);
  await page.goto("/en/settings/profile");
  await expect(page.getByLabel(en.common.nameL, { exact: true })).toHaveAttribute("readonly", "");
  await expect(shown(page, /You can change your name again on/)).toBeVisible();
});

test("rejects a shortened product link before saving", async ({ page }) => {
  await openAs(page, NEWCOMER.email);
  await page.getByLabel(ep.linkL, { exact: true }).fill("bit.ly/maru");
  await saveButton(page).click();
  await expect(shown(page, ep.bRejTitle)).toBeVisible();
  await expect(shown(page, ep.stFailed)).toBeVisible();
  await page.getByRole("button", { name: ep.editLink }).click();
  await expect(page.getByLabel(ep.linkL, { exact: true })).toBeFocused();
  const [row] = await sql("select main_link from profiles where name = $1", [NEWCOMER.name]);
  expect(row.main_link).toBe("https://maruprints.cl");
});

test("rejects a blocked word in the name without asking the model", async ({ page }) => {
  await openAs(page, NEWCOMER.email);
  await page.getByLabel(en.common.nameL, { exact: true }).fill("maru_0fficial");
  await saveButton(page).click();
  await expect(shown(page, ep.bRejNameTitle)).toBeVisible();
  await expect(shown(page, en.payment.rejWhy.blocked_name)).toBeVisible();
  const [row] = await sql("select name from profiles where id = (select profile_id from profile_private where email = $1)", [NEWCOMER.email]);
  expect(row.name).toBe(NEWCOMER.name);
});

test("stops saving after the hourly limit, before any moderation", async ({ page }) => {
  await openAs(page, NEWCOMER.email);
  await sql(
    `insert into rate_limit_hits (key)
     select 'profile_save:' || pp.profile_id from profile_private pp, app_config c, generate_series(1, c.max_profile_saves_per_hour)
     where pp.email = $1`,
    [NEWCOMER.email],
  );
  await page.getByLabel(ep.linkL, { exact: true }).fill("https://maruprints.cl/shop");
  await saveButton(page).click();
  await expect(shown(page, ep.bLimitTitle)).toBeVisible();
  const [row] = await sql("select main_link from profiles where name = $1", [NEWCOMER.name]);
  expect(row.main_link).toBe("https://maruprints.cl");
});

test("uploads a photo, shows it pixelated or as is, and keeps it after saving", async ({ page }) => {
  await openAs(page, NEWCOMER.email);
  await page.getByRole("radio", { name: ep.modeUp }).click();
  await expect(shown(page, ep.upChoose)).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(shown(page, ep.upErrType)).toBeVisible();

  const photo = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 60, g: 140, b: 200 } } })
    .jpeg()
    .toBuffer();
  await page.locator('input[type="file"]').setInputFiles({ name: "maru.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(shown(page, "maru.jpg · shrunk to 32×32 to match the throne.")).toBeVisible();
  await page.getByRole("radio", { name: ep.upAsIs }).click();
  await expect(shown(page, "maru.jpg · shown as is inside the frame.")).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/edit-upload-${test.info().project.name}.png` });

  await saveButton(page).click();
  await expect(shown(page, ep.bSavedTitle)).toBeVisible();
  const [row] = await sql<{ avatar_mode: string; avatar_path: string; avatar_pixelated: boolean }>(
    "select avatar_mode, avatar_path, avatar_pixelated from profiles where name = $1",
    [NEWCOMER.name],
  );
  expect(row.avatar_mode).toBe("upload");
  expect(row.avatar_pixelated).toBe(false);
  for (const file of ["original.webp", "pixel.png"]) {
    const response = await page.request.get(`http://127.0.0.1:54321/storage/v1/object/public/avatars/${row.avatar_path}/${file}`);
    expect(response.status(), file).toBe(200);
  }

  await page.goto(`/en/u/${NEWCOMER.name}`);
  await expect(page.locator(`img[src*="${row.avatar_path}/original.webp"]`).first()).toBeAttached();
});

test("refuses uploads without a session", async ({ page }) => {
  const response = await page.request.post("/api/profile/avatar", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } } });
  expect(response.status()).toBe(401);
  const patch = await page.request.patch("/api/profile", { data: {} });
  expect(patch.status()).toBe(401);
});

test("switches the site language when the preference is saved", async ({ page }) => {
  await openAs(page, NEWCOMER.email);
  await page.getByRole("radio", { name: "Español" }).click();
  await saveButton(page).click();
  await page.waitForURL(/\/es\/settings\/profile$/);
  const [row] = await sql("select locale from profile_private where email = $1", [NEWCOMER.email]);
  expect(row.locale).toBe("es");
});

test("discards unsaved changes", async ({ page }) => {
  await openAs(page, NEWCOMER.email);
  await page.getByLabel(en.social.gh.name, { exact: true }).fill("maru");
  await expect(shown(page, "1 unsaved change")).toBeVisible();
  await page.getByRole("button", { name: ep.discard }).filter({ visible: true }).click();
  await expect(page.getByLabel(en.social.gh.name, { exact: true })).toHaveValue("");
  await expect(shown(page, ep.stClean)).toBeVisible();
});

for (const locale of ["en", "es"] as const) {
  test(`screenshot of edit profile ${locale}`, async ({ page }, info) => {
    await signInByEmail(page, VETERAN.email, `/${locale}/settings/profile`);
    await expect(page.getByRole("heading", { level: 1 }).filter({ visible: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${SCREENS}/edit-profile-${locale}-${info.project.name}.png`, fullPage: info.project.name === "mobile" });
  });
}
