import { describe, expect, it } from "vitest";
import { scrubAnalyticsEvent } from "@/lib/analytics";
import { isShortRoute, shortRouteLocale } from "@/lib/short-routes";

describe("isShortRoute", () => {
  it("matches a bare number of up to four digits, with or without a trailing slash", () => {
    for (const path of ["/7", "/12", "/1234", "/7/"]) expect(isShortRoute(path)).toBe(true);
  });

  it("leaves every other path alone", () => {
    for (const path of ["/", "/en", "/en/7", "/u/7", "/12345", "/7x", "/-7", "/7/8", "/api/7", "/7.png"]) {
      expect(isShortRoute(path)).toBe(false);
    }
  });
});

describe("shortRouteLocale", () => {
  it("prefers the saved choice", () => {
    expect(shortRouteLocale({ cookie: "es", acceptLanguage: "en-US,en;q=0.9" })).toBe("es");
  });

  it("ignores a saved choice the site does not speak", () => {
    expect(shortRouteLocale({ cookie: "fr", acceptLanguage: "es-EC,es;q=0.9" })).toBe("es");
  });

  it("takes the first spoken language by quality", () => {
    expect(shortRouteLocale({ acceptLanguage: "fr-FR,en;q=0.5,es;q=0.8" })).toBe("es");
    expect(shortRouteLocale({ acceptLanguage: "es;q=0.4,en-GB;q=0.9" })).toBe("en");
  });

  it("falls back to the default locale", () => {
    expect(shortRouteLocale({})).toBe("en");
    expect(shortRouteLocale({ acceptLanguage: "fr,de;q=0.8" })).toBe("en");
    expect(shortRouteLocale({ acceptLanguage: "es;q=0" })).toBe("en");
  });
});

describe("analytics on a short route", () => {
  it("reports the short path, which is what tells the videos apart", () => {
    expect(scrubAnalyticsEvent({ type: "pageview", url: "https://takethecrown.app/7" })?.url).toBe("https://takethecrown.app/7");
  });
});
