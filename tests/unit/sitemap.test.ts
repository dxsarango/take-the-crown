import { describe, expect, it } from "vitest";
import { PAGES_PER_FILE, chunk, latest, legalLastmod, notAfter, sitemapIndexXml, urlsetXml, xmlEscape } from "@/lib/seo-sitemap";
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

describe("lastmod is never in the future", () => {
  const now = new Date("2026-10-08T15:00:00Z");
  const lastmods = (xml: string) => [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => new Date(m[1]).getTime());

  it("is cut at now in a sitemap file, whatever the page says", () => {
    const pages = [
      { route: "/rules", lastmod: "2026-10-27T00:00:00Z" },
      { route: "/faq", lastmod: "2027-01-01T00:00:00Z" },
      { route: "/terms", lastmod: "2026-10-08T15:00:00Z" },
      { route: "/privacy", lastmod: "2026-09-01T00:00:00Z" },
    ];
    const dates = lastmods(urlsetXml(SITE, pages, now));
    expect(dates).toHaveLength(8);
    for (const date of dates) expect(date).toBeLessThanOrEqual(now.getTime());
    expect(dates).toContain(now.getTime());
    expect(dates).toContain(new Date("2026-09-01T00:00:00Z").getTime());
  });

  it("is cut at now in the index", () => {
    const xml = sitemapIndexXml(SITE, [{ path: "/sitemaps/static.xml", lastmod: "2026-10-27T00:00:00Z" }, { path: "/sitemaps/seasons.xml", lastmod: "2026-10-01T00:00:00Z" }], now);
    for (const date of lastmods(xml)) expect(date).toBeLessThanOrEqual(now.getTime());
    expect(lastmods(xml)).toHaveLength(2);
  });

  it("holds for any mix of past and future dates", () => {
    const day = 86_400_000;
    const pages = Array.from({ length: 60 }, (_, i) => ({ route: `/u/p${i}`, lastmod: new Date(now.getTime() + (i - 30) * day * 7).toISOString() }));
    for (const date of lastmods(urlsetXml(SITE, pages, now))) expect(date).toBeLessThanOrEqual(now.getTime());
  });

  it("only counts a date that has happened", () => {
    expect(notAfter("2026-10-08T14:59:59Z", now)).toBe("2026-10-08T14:59:59Z");
    expect(notAfter("2026-10-08T15:00:00Z", now)).toBe("2026-10-08T15:00:00Z");
    expect(notAfter("2026-10-27T00:00:00Z", now)).toBeNull();
    expect(notAfter(null, now)).toBeNull();
  });

  describe("legalLastmod", () => {
    it("ignores an effective date that is still ahead and uses the last settings change", () => {
      expect(legalLastmod({ updated_at: "2026-10-05T10:00:00Z", legal_effective_date: "2026-10-27" }, now)).toBe("2026-10-05T10:00:00Z");
    });

    it("uses the effective date once it has come, if it is the later of the two", () => {
      expect(legalLastmod({ updated_at: "2026-10-05T10:00:00Z", legal_effective_date: "2026-10-07" }, now)).toBe("2026-10-07");
      expect(legalLastmod({ updated_at: "2026-10-08T09:00:00Z", legal_effective_date: "2026-10-07" }, now)).toBe("2026-10-08T09:00:00Z");
    });

    it("has nothing to say when both are missing or ahead", () => {
      expect(legalLastmod({ updated_at: null, legal_effective_date: "2026-10-27" }, now)).toBeNull();
      expect(legalLastmod({ updated_at: "2027-01-01T00:00:00Z", legal_effective_date: null }, now)).toBeNull();
      expect(legalLastmod(null, now)).toBeNull();
    });
  });
});
