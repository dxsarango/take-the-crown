import { describe, expect, it } from "vitest";
import { PAGES_PER_FILE, chunk, latest, sitemapIndexXml, urlsetXml, xmlEscape } from "@/lib/seo-sitemap";
import { isCheckoutReturn, isProfileIndexable } from "@/lib/seo";

const SITE = "https://takethecrown.app";
const urls = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

describe("urlsetXml", () => {
  const xml = urlsetXml(SITE, [{ route: "/u/ana", lastmod: "2026-10-08T12:30:00Z" }, { route: "" }]);

  it("lists every page once per language", () => {
    expect(urls(xml)).toEqual([`${SITE}/en/u/ana`, `${SITE}/es/u/ana`, `${SITE}/en`, `${SITE}/es`]);
  });

  it("names every version of each page, itself included, and x-default, on both entries", () => {
    for (const locale of ["en", "es"]) {
      const entry = xml.split("<url>").find((e) => e.includes(`<loc>${SITE}/${locale}/u/ana</loc>`))!;
      expect([...entry.matchAll(/hreflang="([^"]*)" href="([^"]*)"/g)].map((m) => [m[1], m[2]])).toEqual([
        ["en", `${SITE}/en/u/ana`],
        ["es", `${SITE}/es/u/ana`],
        ["x-default", `${SITE}/en/u/ana`],
      ]);
    }
  });

  it("adds lastmod when the page has one", () => {
    expect(xml.match(/<lastmod>2026-10-08T12:30:00.000Z<\/lastmod>/g)).toHaveLength(2);
    expect(xml.split("<url>").filter((e) => e.includes(`<loc>${SITE}/en</loc>`))[0]).not.toContain("<lastmod>");
  });

  it("escapes what a name could break", () => {
    expect(urlsetXml(SITE, [{ route: "/u/a&b<c>" }])).toContain("/en/u/a&amp;b&lt;c&gt;");
    expect(xmlEscape(`"x" & 'y'`)).toBe("&quot;x&quot; &amp; &apos;y&apos;");
  });
});

describe("sitemapIndexXml", () => {
  it("points to each file with its last change", () => {
    const xml = sitemapIndexXml(SITE, [{ path: "/sitemaps/static.xml", lastmod: "2026-10-08T00:00:00Z" }, { path: "/sitemaps/seasons.xml" }]);
    expect(urls(xml)).toEqual([`${SITE}/sitemaps/static.xml`, `${SITE}/sitemaps/seasons.xml`]);
    expect(xml).toContain("<lastmod>2026-10-08T00:00:00.000Z</lastmod>");
  });
});

describe("chunk", () => {
  it("keeps every file under 50,000 URLs (two per page)", () => {
    expect(PAGES_PER_FILE * 2).toBeLessThan(50_000);
    const files = chunk(Array.from({ length: PAGES_PER_FILE * 2 + 1 }, (_, i) => i));
    expect(files.map((f) => f.length)).toEqual([PAGES_PER_FILE, PAGES_PER_FILE, 1]);
  });

  it("always has one file, even with no pages", () => {
    expect(chunk([])).toEqual([[]]);
  });
});

describe("latest", () => {
  it("picks the newest valid time", () => {
    expect(latest("2026-01-01T00:00:00Z", null, "2026-03-01T00:00:00Z", undefined, "nonsense")).toBe("2026-03-01T00:00:00Z");
    expect(latest(null, undefined)).toBeNull();
  });
});

describe("indexing rules", () => {
  it("indexes only players who reigned and are not suspended", () => {
    expect(isProfileIndexable({ crowns: 1, suspended: false })).toBe(true);
    expect(isProfileIndexable({ crowns: 0, suspended: false })).toBe(false);
    expect(isProfileIndexable({ crowns: 5, suspended: true })).toBe(false);
  });

  it("keeps checkout returns out of the index", () => {
    expect(isCheckoutReturn({ lock: "abc", cancelled: "1" })).toBe(true);
    expect(isCheckoutReturn({ card: "duke" })).toBe(false);
    expect(isCheckoutReturn({})).toBe(false);
  });
});
