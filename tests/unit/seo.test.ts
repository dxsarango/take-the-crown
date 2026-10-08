import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

vi.mock("server-only", () => ({}));
// The real module reads the database; only the card sizes matter here.
vi.mock("@/lib/og/data", () => ({ CARD_SIZES: { og: { width: 1200, height: 630 }, story: { width: 1080, height: 1920 } } }));

const { alternatesFor, withBrand } = await import("@/lib/seo");
const { BRAND_NAME } = await import("@/lib/config/brand");
const filled = (text: string) => text.replaceAll("{brand}", BRAND_NAME);
const { shareMetadata } = await import("@/lib/og/metadata");

describe("alternatesFor", () => {
  it("makes the page canonical to itself and lists every language", () => {
    expect(alternatesFor("es", "/kingdom")).toEqual({
      canonical: "/es/kingdom",
      languages: { en: "/en/kingdom", es: "/es/kingdom", "x-default": "/en/kingdom" },
    });
  });

  it("uses the locale prefix alone for the home page", () => {
    expect(alternatesFor("en", "").canonical).toBe("/en");
    expect(alternatesFor("es", "").languages).toMatchObject({ en: "/en", es: "/es", "x-default": "/en" });
  });

  it("keeps a parameter that changes the content in every language", () => {
    expect(alternatesFor("en", "/kingdom", "?season=genesis").languages).toEqual({
      en: "/en/kingdom?season=genesis",
      es: "/es/kingdom?season=genesis",
      "x-default": "/en/kingdom?season=genesis",
    });
  });
});

describe("shareMetadata", () => {
  const base = { title: "T", description: "D", route: "/rules", card: null, alt: "A" } as const;

  it("declares the canonical URL, the other language and the open graph locales", () => {
    const meta = shareMetadata({ ...base, locale: "es" });
    expect(meta.alternates?.canonical).toBe("/es/rules");
    expect(meta.openGraph).toMatchObject({ url: "/es/rules", locale: "es_419", alternateLocale: ["en_US"], type: "website" });
    expect(shareMetadata({ ...base, locale: "en" }).openGraph).toMatchObject({ locale: "en_US", alternateLocale: ["es_419"] });
  });

  it("previews pages without a share card with the crown icon", () => {
    const meta = shareMetadata({ ...base, locale: "en" });
    expect(meta.openGraph?.images).toEqual([{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "A" }]);
    expect(meta.twitter).toMatchObject({ card: "summary", images: ["/icons/icon-512.png"] });
  });

  it("uses the share card at 1200x630 when the page has one", () => {
    const meta = shareMetadata({ ...base, locale: "en", card: { template: "victory", id: "7" } });
    expect(meta.openGraph?.images).toEqual([{ url: "/og/victory/7?locale=en", width: 1200, height: 630, alt: "A" }]);
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("page copy", () => {
  const PAGES = ["home", "kingdom", "hallOfFame", "rules", "faq", "terms", "privacy"] as const;

  it.each([
    ["en", en],
    ["es", es],
  ] as const)("has a title and a description of the right size in %s", (_locale, messages) => {
    for (const page of PAGES) {
      const title = filled(messages.seo[page].title);
      const description = filled(messages.seo[page].description);
      // About 50 to 60 characters with the brand at the end, and about 140 to 160 for the description.
      expect(withBrand(title).length, page).toBeGreaterThanOrEqual(45);
      expect(withBrand(title).length, page).toBeLessThanOrEqual(65);
      expect(description.length, page).toBeGreaterThanOrEqual(120);
      expect(description.length, page).toBeLessThanOrEqual(165);
    }
  });

  it("is different on every page and in both languages", () => {
    const all = PAGES.flatMap((p) => [en.seo[p], es.seo[p]]);
    expect(new Set(all.map((p) => p.title)).size).toBe(all.length);
    expect(new Set(all.map((p) => p.description)).size).toBe(all.length);
  });
});
