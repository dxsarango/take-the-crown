import type { Metadata } from "next";
import { type Locale, routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";

export const OG_LOCALE: Record<Locale, string> = { en: "en_US", es: "es_419" };

/** "Rules: how to take the crown — Take the Crown": the brand always closes a title. */
export function withBrand(title: string): string {
  return `${title} — ${BRAND_NAME}`;
}

/** Only players who have reigned and are not suspended get an indexable page: the rest would be thin. */
export function isProfileIndexable(profile: { crowns: number; suspended: boolean }): boolean {
  return profile.crowns > 0 && !profile.suspended;
}

/** The player was sent back from checkout: the page is the home page, not something to index. */
export function isCheckoutReturn(searchParams: Record<string, string | string[] | undefined>): boolean {
  return searchParams.lock !== undefined;
}

export const NOINDEX: NonNullable<Metadata["robots"]> = { index: false, follow: true };

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
