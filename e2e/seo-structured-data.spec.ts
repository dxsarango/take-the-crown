import { expect, test } from "@playwright/test";
import { sql } from "./fixtures/db";
import { seedKingdom } from "./fixtures/kingdom";
import { SITE } from "./fixtures/site";

// The structured data a crawler reads from the HTML of each page.
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await seedKingdom();
  await sql("insert into profiles (name) values ('lurker.test')");
  await sql("update profiles set is_banned = true where name = 'jules'");
  await sql("update app_config set legal_contact_email = 'hello@takethecrown.app'");
});
test.beforeEach(() => {
  test.skip(test.info().project.name !== "desktop", "server behaviour");
});

type Block = Record<string, unknown>;

async function blocks(request: import("@playwright/test").APIRequestContext, url: string): Promise<{ html: string; data: Block[] }> {
  const html = await (await request.get(url)).text();
  const data = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]) as Block);
  return { html, data };
}

const types = (data: Block[]) => data.map((d) => d["@type"] ?? "@graph");

test("the home page describes the website and the organization, in the page's language", async ({ request }) => {
  // The contact email is read through a 10 s cache that earlier specs may have filled.
  await expect.poll(async () => JSON.stringify((await blocks(request, "/en")).data), { timeout: 20_000 }).toContain("hello@takethecrown.app");
  for (const locale of ["en", "es"]) {
    const { data } = await blocks(request, `/${locale}`);
    expect(types(data)).toEqual(["@graph"]);
    const [website, organization] = data[0]["@graph"] as Block[];
    expect(website).toMatchObject({ "@type": "WebSite", name: "Take the Crown", url: `${SITE}/${locale}`, inLanguage: ["en", "es"] });
    expect(organization).toMatchObject({
      "@type": "Organization",
      name: "Take the Crown",
      logo: { url: `${SITE}/icons/icon-512.png` },
      email: "hello@takethecrown.app",
    });
    expect(organization.sameAs).toEqual(["https://x.com/takethecrownapp", "https://www.instagram.com/takethecrown.app/", "https://www.tiktok.com/@takethecrownapp"]);
  }
});

test("a profile is a ProfilePage whose main entity is the player, with the links the page shows", async ({ request }) => {
  await sql("update profiles set link_x = 'https://x.com/valeruiz', main_link = 'https://pesito.app' where name = 'valeruiz'");
  const { data } = await blocks(request, "/en/u/valeruiz");
  expect(types(data)).toEqual(["ProfilePage", "BreadcrumbList"]);
  expect(data[0]).toMatchObject({
    url: `${SITE}/en/u/valeruiz`,
    inLanguage: "en",
    mainEntity: { "@type": "Person", name: "valeruiz", url: `${SITE}/en/u/valeruiz` },
  });
  expect((data[0].mainEntity as Block).sameAs).toEqual(expect.arrayContaining(["https://x.com/valeruiz", "https://pesito.app"]));
  expect(data[1].itemListElement).toEqual([
    { "@type": "ListItem", position: 1, name: "Take the Crown", item: `${SITE}/en` },
    { "@type": "ListItem", position: 2, name: "valeruiz", item: `${SITE}/en/u/valeruiz` },
  ]);
});

test("a profile that is not indexed says nothing to search engines", async ({ request }) => {
  for (const name of ["lurker.test", "jules"]) expect((await blocks(request, `/en/u/${name}`)).data, name).toEqual([]);
});

test("a season has its path from the home page", async ({ request }) => {
  const { data } = await blocks(request, "/es/seasons/genesis");
  expect(types(data)).toEqual(["BreadcrumbList"]);
  const names = (data[0].itemListElement as Block[]).map((i) => i.name);
  expect(names).toEqual(["Take the Crown", "Historia del reino", "Génesis"]);
});

test("the legal pages have a path, and the FAQ lists the questions it shows", async ({ request }) => {
  for (const doc of ["rules", "terms", "privacy"]) expect(types((await blocks(request, `/en/${doc}`)).data), doc).toEqual(["BreadcrumbList"]);
  const { html, data } = await blocks(request, "/en/faq");
  expect(types(data)).toEqual(["BreadcrumbList", "FAQPage"]);
  const questions = (data[1].mainEntity as Block[]).map((q) => q.name as string);
  expect(questions.length).toBeGreaterThan(8);
  expect(questions).toContain("Can I get a refund?");
  // Nothing marked up that the page does not show.
  const escaped = (text: string) => text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
  for (const question of questions) expect(html.includes(escaped(question)), question).toBe(true);
});

test("pages with no structured data have none", async ({ request }) => {
  for (const url of ["/en/kingdom", "/en/hall-of-fame", "/en/u/nobody"]) expect((await blocks(request, url)).data, url).toEqual([]);
});

test("the page's script policy does not object to the data blocks", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text());
  });
  for (const url of ["/en", "/en/u/valeruiz", "/en/faq"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    expect(await page.locator('script[type="application/ld+json"]').count(), url).toBeGreaterThan(0);
  }
  expect(violations).toEqual([]);
});
