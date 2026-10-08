import { expect, test } from "@playwright/test";
import { seedProfiles, VETERAN } from "./fixtures/profiles";

// What a crawler, a screen reader or a visitor without scripts reads in the HTML itself.
test.describe.configure({ mode: "serial" });
test.beforeAll(seedProfiles);
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop", "server behaviour");
});

const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

const headings = (html: string, level: number) => [...html.matchAll(new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, "g"))].map((m) => text(m[1]).trim());

test.describe("the home page", () => {
  test("has one h1, the name of the game, and explains the game in plain text", async ({ request }) => {
    const html = await (await request.get("/en")).text();
    expect(headings(html, 1)).toEqual(["Take the Crown"]);
    expect(headings(html, 2)).toContain("How it works");
    const body = text(html);
    expect(body).toContain("Take the Crown has one crown. Whoever pays the price on the throne becomes king");
    // The numbers are the live settings, not copy.
    expect(body).toMatch(/drops \d+(\.\d+)?% every hour while nobody buys, down to a floor of \$\d+/);
    expect(body).toContain("There are no prizes or payouts. You pay for visibility and glory.");
  });

  test("says the same in Spanish", async ({ request }) => {
    const html = await (await request.get("/es")).text();
    expect(headings(html, 1)).toEqual(["Take the Crown"]);
    expect(headings(html, 2)).toContain("Cómo funciona");
    expect(text(html)).toMatch(/baja \d+(,\d+)?\s?% cada hora mientras nadie compra, hasta un mínimo de \$\d+/);
  });

  test("links to the rules, the questions, the history, the hall of fame and the season", async ({ request }) => {
    for (const locale of ["en", "es"]) {
      const html = await (await request.get(`/${locale}`)).text();
      const about = /<section aria-labelledby="about-title"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
      const hrefs = [...about.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);
      expect(hrefs).toEqual([`/${locale}/rules`, `/${locale}/faq`, `/${locale}/kingdom`, `/${locale}/hall-of-fame`, `/${locale}/seasons/genesis`]);
    }
  });

  test("keeps the king's name as a heading below the title", async ({ request }) => {
    expect(headings(await (await request.get("/en")).text(), 2)).toContain("valeruiz");
  });
});

test.describe("a profile", () => {
  test("links to its rival and to the seasons it has collectibles for", async ({ request }) => {
    const html = await (await request.get(`/en/u/${VETERAN.name}`)).text();
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.filter((h) => /^\/en\/u\//.test(h) && h !== `/en/u/${VETERAN.name}`).length).toBeGreaterThan(0);
    expect(hrefs).toContain("/en/seasons/genesis");
  });

  test("shows the footer links to the legal pages", async ({ request }) => {
    const html = await (await request.get(`/en/u/${VETERAN.name}`)).text();
    for (const page of ["rules", "faq", "terms", "privacy"]) expect(html).toContain(`href="/en/${page}"`);
  });
});

test.describe("the privacy policy", () => {
  test("discloses the visit statistics in both languages", async ({ request }) => {
    const en = text(await (await request.get("/en/privacy")).text());
    expect(en).toContain("Vercel Web Analytics");
    expect(en).toContain("sets no cookies and stores nothing on your device");
    expect(en).toContain("We do not use advertising cookies. The visit statistics described in section 2 use no cookies");
    const es = text(await (await request.get("/es/privacy")).text());
    expect(es).toContain("Vercel Web Analytics");
    expect(es).toContain("No usa cookies ni guarda nada en tu dispositivo");
    expect(es).toContain("No usamos cookies de publicidad.");
  });
});
