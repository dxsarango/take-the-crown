import { expect, test } from "@playwright/test";
import { sql } from "./fixtures/db";
import { seedKingdom } from "./fixtures/kingdom";
import { SITE } from "./fixtures/site";

// What a crawler is told: robots.txt, the sitemaps, which pages may be indexed and where moved pages went.
test.describe.configure({ mode: "serial" });
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop", "server behaviour");
});

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
const robotsTag = (html: string) => /<meta name="robots" content="([^"]*)"/.exec(html)?.[1];

/** The throne room, a player who never reigned, and a suspended one. */
async function seed() {
  await seedKingdom();
  await sql("insert into profiles (name) values ('lurker.test')");
  await sql("update profiles set is_banned = true where name = 'jules'");
}

test.describe("sitemaps", () => {
  test.beforeAll(seed);

  test("an index points to the static pages, the seasons and the players", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    expect(xml).toContain("<sitemapindex");
    expect(locs(xml)).toEqual([`${SITE}/sitemaps/static.xml`, `${SITE}/sitemaps/seasons.xml`, `${SITE}/sitemaps/profiles-1.xml`]);
    expect(xml.match(/<lastmod>/g)).toHaveLength(3);
  });

  test("the static file has the seven pages in both languages, each with its last change", async ({ request }) => {
    const xml = await (await request.get("/sitemaps/static.xml")).text();
    expect(locs(xml)).toHaveLength(14);
    expect(locs(xml)).toEqual(expect.arrayContaining([`${SITE}/en`, `${SITE}/es`, `${SITE}/en/kingdom`, `${SITE}/es/hall-of-fame`, `${SITE}/en/privacy`]));
    expect(xml.match(/<lastmod>/g)).toHaveLength(14);
  });

  test("players who reigned are listed; suspended, empty and unknown ones are not", async ({ request }) => {
    const xml = await (await request.get("/sitemaps/profiles-1.xml")).text();
    const urls = locs(xml);
    expect(urls).toEqual(expect.arrayContaining([`${SITE}/en/u/valeruiz`, `${SITE}/es/u/kenji`]));
    expect(urls.join(" ")).not.toMatch(/\/u\/(jules|lurker\.test)(\s|$)/);
    expect((await request.get("/sitemaps/profiles-9.xml")).status()).toBe(404);
    expect((await request.get("/sitemaps/profiles-0.xml")).status()).toBe(404);
    expect((await request.get("/sitemaps/nope.xml")).status()).toBe(404);
  });

  test("every listed URL is served, canonical to itself, and not noindex", async ({ request }) => {
    for (const file of ["static", "seasons", "profiles-1"]) {
      for (const url of locs(await (await request.get(`/sitemaps/${file}.xml`)).text())) {
        const response = await request.get(url, { maxRedirects: 0 });
        expect(response.status(), url).toBe(200);
        const html = await response.text();
        expect(html, url).toContain(`<link rel="canonical" href="${url}"/>`);
        expect(robotsTag(html), url).toBeUndefined();
      }
    }
  });
});

test("robots.txt opens the pages and their assets, closes the private areas and names the AI crawlers", async ({ request }) => {
  const text = await (await request.get("/robots.txt")).text();
  expect(text).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  const groups = text.split(/\n\n/).filter((g) => g.includes("User-Agent"));
  expect(groups).toHaveLength(2);
  for (const group of groups) {
    expect(group).toContain("Allow: /\n");
    for (const path of ["/api/", "/auth/", "/*/admin", "/*/settings/", "/*/alerts/"]) expect(group).toContain(`Disallow: ${path}`);
    expect(group).not.toMatch(/Disallow: \/(_next|art|og|avatar|icons)/);
  }
  for (const bot of ["GPTBot", "ClaudeBot", "OAI-SearchBot", "PerplexityBot", "Google-Extended"]) expect(groups[1]).toContain(`User-Agent: ${bot}`);
});

test.describe("which pages are indexed", () => {
  test.beforeAll(seed);

  test("a player with reigns is, an empty or suspended profile is not", async ({ request }) => {
    expect(robotsTag(await (await request.get("/en/u/valeruiz")).text())).toBeUndefined();
    for (const name of ["lurker.test", "jules"]) {
      const response = await request.get(`/en/u/${name}`);
      expect(response.status()).toBe(200);
      expect(robotsTag(await response.text()), name).toBe("noindex, follow");
    }
  });

  test("coming back from checkout is not, with or without the cancel parameter", async ({ request }) => {
    for (const query of ["?lock=abc", "?lock=abc&cancelled=1"]) {
      const html = await (await request.get(`/en${query}`)).text();
      expect(robotsTag(html), query).toBe("noindex, follow");
      expect(html).toContain(`<link rel="canonical" href="${SITE}/en"/>`);
    }
    expect(robotsTag(await (await request.get("/en")).text())).toBeUndefined();
  });

  test("private and unknown pages answer with their own status and noindex", async ({ request }) => {
    for (const url of ["/en/u/nobody", "/es/u/nobody", "/en/seasons/nope", "/en/nope", "/en/admin"]) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(404);
      expect(robotsTag(await response.text()), url).toBe("noindex");
    }
    expect(robotsTag(await (await request.get("/en/alerts/off")).text())).toBe("noindex, nofollow");
    const settings = await request.get("/en/settings/profile", { maxRedirects: 0 });
    expect(settings.status()).toBe(307);
  });
});

test.describe("moved pages", () => {
  test.beforeAll(async () => {
    await seedKingdom();
    await sql("insert into profile_name_history (name, profile_id) select 'old_vale', id from profiles where name = 'valeruiz'");
  });

  test("another capitalization or a former name goes to the current name with a permanent redirect", async ({ request }) => {
    for (const from of ["VALERUIZ", "Valeruiz", "old_vale"]) {
      const response = await request.get(`/es/u/${from}`, { maxRedirects: 0 });
      expect(response.status(), from).toBe(308);
      expect(new URL(response.headers().location, SITE).pathname).toBe("/es/u/valeruiz");
    }
  });

  test("the root picks a language with a temporary redirect and no hreflang header", async ({ request }) => {
    const spanish = await request.get("/", { maxRedirects: 0, headers: { "accept-language": "es-EC,es;q=0.9" } });
    expect(spanish.status()).toBe(307);
    expect(spanish.headers().location).toMatch(/\/es$/);
    const crawler = await request.get("/", { maxRedirects: 0, headers: { "accept-language": "" } });
    expect(crawler.headers().location).toMatch(/\/en$/);
    expect(spanish.headers().link ?? "").not.toContain("hreflang");
  });
});
