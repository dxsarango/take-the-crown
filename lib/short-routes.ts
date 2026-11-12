import { routing, type Locale } from "@/i18n/routing";

// One address per video (`/7`): short enough to type from a screen, and its path is what the page
// view measurement reports. Locale prefixes and every other path stay as they are.
const SHORT_ROUTE = /^\/\d{1,4}\/?$/;

export function isShortRoute(pathname: string): boolean {
  return SHORT_ROUTE.test(pathname);
}

const isLocale = (value: string | undefined): value is Locale => routing.locales.includes(value as Locale);

/**
 * The language a visitor on a short route gets: their saved choice (next-intl's cookie), else the
 * first language in `Accept-Language` the site speaks, else the default.
 */
export function shortRouteLocale({ cookie, acceptLanguage }: { cookie?: string; acceptLanguage?: string | null }): Locale {
  if (isLocale(cookie)) return cookie;
  const tags = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { language: tag.toLowerCase().split("-")[0] ?? "", q: q === undefined ? 1 : Number(q) || 0 };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q);
  return tags.map((entry) => entry.language).find(isLocale) ?? routing.defaultLocale;
}
