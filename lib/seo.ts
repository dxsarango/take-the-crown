import type { Metadata } from "next";
import { type Locale, routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";

export const OG_LOCALE: Record<Locale, string> = { en: "en_US", es: "es_419" };

/** "Rules: how to take the crown — Take the Crown": the brand always closes a title. */
export function withBrand(title: string): string {
  return `${title} — ${BRAND_NAME}`;
}

/**
 * The canonical URL and the hreflang set of a page. `route` is the path without its locale
 * ("" for the home page, "/kingdom"); `query` keeps a parameter that changes the content
 * ("?season=frost"). URLs are relative to `metadataBase`. Every language version lists all of
 * them, itself included, and `x-default` is the default language.
 */
export function alternatesFor(locale: Locale, route: string, query = ""): NonNullable<Metadata["alternates"]> {
  const at = (l: string) => `/${l}${route}${query}`;
  return {
    canonical: at(locale),
    languages: { ...Object.fromEntries(routing.locales.map((l) => [l, at(l)])), "x-default": at(routing.defaultLocale) },
  };
}
