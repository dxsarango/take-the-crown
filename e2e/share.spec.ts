import { mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { sql } from "./fixtures/db";
import { resetKingdom, seedKingdom } from "./fixtures/kingdom";

test.describe.configure({ mode: "serial" });

const SCREENS = "test-results/screens";

type Ids = { victory: string; challenge: string; achievement: string; dethroned: string; dethronedLong: string };
let ids: Ids;

test.beforeAll(async ({}, info) => {
  // Share cards are the same at every viewport: one project is enough.
  test.skip(info.project.name !== "desktop", "cards do not depend on the viewport");
  await mkdir(SCREENS, { recursive: true });
  await seedKingdom();
  const [king] = await sql<{ id: string; profile_id: string }>(
    "select r.id, r.profile_id from crown_state c join reigns r on r.id = c.current_reign_id",
  );
  const byName = async (name: string) =>
    (await sql<{ id: string; profile_id: string }>(
      "select r.id, r.profile_id from reigns r join profiles p on p.id = r.profile_id where p.name = $1 and r.season_id = 0 order by r.started_at desc limit 1",
      [name],
    ))[0];
  // The fixture leaves dethroned_by empty; link two reigns to the players who ended them.
  const kenji = await byName("kenji");
  const lucas = await byName("lucas.fm");
  const ana = await byName("ana.codes");
  await sql("update reigns set dethroned_by = $2 where id = $1", [kenji.id, king.profile_id]);
  await sql("update reigns set dethroned_by = $2, ended_at = started_at + interval '11 seconds' where id = $1", [lucas.id, ana.profile_id]);
  await sql(
    "insert into profile_achievements (profile_id, achievement_code, season_id) values ($1, 'regicide', 0) on conflict do nothing",
    [kenji.profile_id],
  );
  ids = {
    victory: String(king.id),
    challenge: String(king.id),
    achievement: `${kenji.profile_id}_regicide`,
    dethroned: String(lucas.id),
    dethronedLong: String(kenji.id),
  };
});
test.afterAll(async ({}, info) => {
  if (info.project.name === "desktop") await resetKingdom();
});

const SIZES = { og: [1200, 630], story: [1080, 1920] } as const;

test("renders the four cards at both sizes", async ({ request }) => {
  test.setTimeout(120_000);
  for (const template of ["victory", "challenge", "achievement", "dethroned"] as const) {
    for (const size of ["og", "story"] as const) {
      for (const locale of ["en", "es"] as const) {
        const response = await request.get(`/og/${template}/${ids[template]}?size=${size}&locale=${locale}`);
        expect(response.status(), `${template} ${size} ${locale}`).toBe(200);
        expect(response.headers()["content-type"]).toBe("image/png");
        const png = await response.body();
        const meta = await sharp(png).metadata();
        expect([meta.width, meta.height]).toEqual([...SIZES[size]]);
        await writeFile(`${SCREENS}/card-${template}-${size}-${locale}.png`, png);
      }
    }
  }
  const long = await request.get(`/og/dethroned/${ids.dethronedLong}`);
  expect(long.status()).toBe(200);
  await writeFile(`${SCREENS}/card-dethroned-long.png`, await long.body());
});

test("answers 404 for cards that do not exist", async ({ request }) => {
  for (const url of [
    "/og/crowned/1",
    "/og/victory/999999",
    "/og/victory/abc",
    `/og/challenge/${ids.dethroned}`,
    `/og/dethroned/${ids.victory}`,
    "/og/achievement/00000000-0000-0000-0000-000000000000_regicide",
    `/og/victory/${ids.victory}?size=square`,
  ]) {
    expect((await request.get(url)).status(), url).toBe(404);
  }
});

test("caches finished reigns for long and live ones briefly", async ({ request }) => {
  expect((await request.get(`/og/dethroned/${ids.dethroned}`)).headers()["cache-control"]).toContain("s-maxage=604800");
  expect((await request.get(`/og/challenge/${ids.challenge}`)).headers()["cache-control"]).toContain("s-maxage=300");
});

test("screenshot cards at X feed thumbnail size", async ({ page }) => {
  // X shows the large card at about 506 px wide (scale 0.42): who, how long or how much, and the
  // crown must still read.
  const cards = ["victory", "challenge", "achievement", "dethroned"].map((t) => `/og/${t}/${ids[t as keyof Ids]}`);
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.setContent(
    `<body style="margin:0;padding:24px;background:#0E0C14;display:flex;flex-wrap:wrap;gap:24px">${cards
      .map((src) => `<img src="${new URL(src, test.info().project.use.baseURL).href}" width="506" height="266">`)
      .join("")}</body>`,
  );
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: `${SCREENS}/cards-thumbnail.png` });
});

test("link previews use the matching share card", async ({ page }) => {
  const meta = async (url: string) => {
    await page.goto(url);
    const content = async (selector: string) => {
      const tag = page.locator(selector);
      return (await tag.count()) ? tag.first().getAttribute("content") : null;
    };
    return {
      image: await content('meta[property="og:image"]'),
      twitter: await content('meta[name="twitter:card"]'),
      twitterImage: await content('meta[name="twitter:image"]'),
    };
  };

  const home = await meta("/es");
  expect(home.image).toBe(`http://localhost:3000/og/challenge/${ids.challenge}?locale=es`);
  expect(home.twitter).toBe("summary_large_image");
  expect(home.twitterImage).toBe(home.image);

  const kenjiId = ids.achievement.split("_")[0];
  expect((await meta("/en/u/kenji?card=regicide")).image).toBe(`http://localhost:3000/og/achievement/${kenjiId}_regicide?locale=en`);
  // A medal the player does not have falls back to their latest reign, here a dethroning.
  expect((await meta("/en/u/kenji?card=founder")).image).toBe(`http://localhost:3000/og/dethroned/${ids.dethronedLong}?locale=en`);
  expect((await meta("/en/u/valeruiz")).image).toBe(`http://localhost:3000/og/victory/${ids.victory}?locale=en`);

  const season = await meta("/en/seasons/genesis");
  expect(season.twitter).toBe("summary");
  expect(season.image).toBeNull();

  // Once the season has its king, the preview is that king's longest reign of the season.
  const [theo] = await sql<{ profile_id: string; id: string }>(
    "select r.profile_id, r.id from reigns r join profiles p on p.id = r.profile_id where p.name = 'theo_builds' and r.season_id = 0 order by r.duration_seconds desc limit 1",
  );
  await sql("update seasons set king_profile_id = $1 where id = 0", [theo.profile_id]);
  expect((await meta("/en/seasons/genesis")).image).toBe(`http://localhost:3000/og/victory/${theo.id}?locale=en`);
});
