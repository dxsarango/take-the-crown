import { expect, test } from "@playwright/test";
import { seedKingdom } from "./fixtures/kingdom";
import { SITE } from "./fixtures/site";

// What a crawler reads: the tags in the HTML each indexable page is served with.
const ROUTES = ["", "/kingdom", "/hall-of-fame", "/seasons/genesis", "/u/valeruiz", "/rules", "/faq", "/terms", "/privacy"];
const LOCALES = ["en", "es"] as const;

test.describe.configure({ mode: "serial" });
test.beforeAll(() => seedKingdom());

/** The attributes of every <meta> and <link> tag, so the order they are written in does not matter. */
function headTags(html: string): Record<string, string>[] {
  return [...html.matchAll(/<(?:meta|link) ([^>]*)>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])));
}

function attr(html: string, key: string, value: string, read: string): string | undefined {
  return headTags(html).find((t) => t[key] === value)?.[read];
}

const decode = (text: string | undefined) => text?.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

async function tags(html: string) {
  return {
    title: decode(/<title>([^<]*)<\/title>/.exec(html)?.[1]),
    description: decode(attr(html, "name", "description", "content")),
    canonical: attr(html, "rel", "canonical", "href"),
    og: (property: string) => attr(html, "property", property, "content"),
    twitter: (name: string) => attr(html, "name", name, "content"),
    alternates: Object.fromEntries(headTags(html).filter((t) => t.rel === "alternate" && t.hrefLang).map((t) => [t.hrefLang, t.href])),
    lang: /<html lang="([^"]*)"/.exec(html)?.[1],
  };
}

test.describe("indexable pages", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "server behaviour");
  });

  for (const locale of LOCALES) {
    for (const route of ROUTES) {
      test(`${locale}${route || "/"} is canonical to itself and links its translation`, async ({ request }) => {
        const response = await request.get(`/${locale}${route}`);
        expect(response.status()).toBe(200);
        const page = await tags(await response.text());
        const self = `${SITE}/${locale}${route}`;
        expect(page.lang).toBe(locale);
        expect(page.canonical).toBe(self);
        expect(page.alternates).toEqual({ en: `${SITE}/en${route}`, es: `${SITE}/es${route}`, "x-default": `${SITE}/en${route}` });
        expect(page.og("og:url")).toBe(self);
        expect(page.og("og:locale")).toBe(locale === "en" ? "en_US" : "es_419");
        expect(page.og("og:locale:alternate")).toBe(locale === "en" ? "es_419" : "en_US");
        expect(page.og("og:type")).toBe("website");
        expect(page.og("og:title")).toBe(page.title);
        expect(page.og("og:description")).toBe(page.description);
        expect(page.og("og:image")).toMatch(/^https?:\/\/.+\/(og\/|icons\/)/);
        expect(page.twitter("twitter:card")).toMatch(/^summary(_large_image)?$/);
        expect(page.title).toMatch(/ — Take the Crown$/);
        expect(page.description!.length).toBeGreaterThan(60);
      });
    }
  }

  test("every page has its own title and description in each language", async ({ request }) => {
    for (const locale of LOCALES) {
      const titles = new Set<string>();
      const descriptions = new Set<string>();
      for (const route of ROUTES) {
        const page = await tags(await (await request.get(`/${locale}${route}`)).text());
        titles.add(page.title!);
        descriptions.add(page.description!);
      }
      expect(titles.size, `${locale} titles`).toBe(ROUTES.length);
      expect(descriptions.size, `${locale} descriptions`).toBe(ROUTES.length);
    }
  });

  test("profiles and seasons say who and when", async ({ request }) => {
    const profile = await tags(await (await request.get("/en/u/valeruiz")).text());
    expect(profile.title).toBe("valeruiz, Duke — Take the Crown");
    expect(profile.description).toMatch(/^valeruiz is a Duke on Take the Crown, with \d+ reigns? and \d+h \d\dm on the throne\./);
    const season = await tags(await (await request.get("/es/seasons/genesis")).text());
    expect(season.title).toBe("Temporada 0: Génesis, rey y récords — Take the Crown");
    expect(season.description).toMatch(/^La temporada 0, Génesis, va del \d+ \w+ 20\d\d al \d+ \w+ 20\d\d\./);
  });

  test("a season's history is its own page, and an ignored parameter is not", async ({ request }) => {
    await seedKingdom({ season: 1 });
    // The pages read the current season through a 10 s cache.
    await expect
      .poll(async () => (await tags(await (await request.get("/en/kingdom?season=genesis")).text())).canonical, { timeout: 20_000 })
      .toBe(`${SITE}/en/kingdom?season=genesis`);
    const past = await tags(await (await request.get("/en/kingdom?season=genesis")).text());
    expect(past.title).toBe("History of the realm, season 0: Genesis — Take the Crown");
    const current = await tags(await (await request.get("/en/kingdom?season=frost&utm=x")).text());
    expect(current.canonical).toBe(`${SITE}/en/kingdom`);
    const card = await tags(await (await request.get("/en/u/valeruiz?card=duke")).text());
    expect(card.canonical).toBe(`${SITE}/en/u/valeruiz`);
  });
});
