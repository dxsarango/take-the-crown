import { routing } from "@/i18n/routing";

/** A page of the site, without its locale prefix ("" is the home page), and when it last changed. */
export type SitemapPage = { route: string; lastmod?: string | null };

// Google reads at most 50,000 URLs per file; every page here is two URLs (one per language).
export const PAGES_PER_FILE = 20_000;

const XML = '<?xml version="1.0" encoding="UTF-8"?>\n';

export function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const day = (iso: string) => new Date(iso).toISOString();

/**
 * A sitemap file. Each page is listed once per language, and each entry names every version of
 * the page, itself included, plus x-default: the same set the page's own tags carry.
 */
export function urlsetXml(site: string, pages: SitemapPage[]): string {
  const at = (locale: string, route: string) => `${site}/${locale}${route}`;
  const entries = pages.flatMap(({ route, lastmod }) =>
    routing.locales.map((locale) => {
      const links = [
        ...routing.locales.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${xmlEscape(at(l, route))}"/>`),
        `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(at(routing.defaultLocale, route))}"/>`,
      ];
      return `<url><loc>${xmlEscape(at(locale, route))}</loc>${lastmod ? `<lastmod>${day(lastmod)}</lastmod>` : ""}${links.join("")}</url>`;
    }),
  );
  return `${XML}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`;
}

/** The index that points to the files of each type. */
export function sitemapIndexXml(site: string, files: { path: string; lastmod?: string | null }[]): string {
  const entries = files.map(
    (f) => `<sitemap><loc>${xmlEscape(`${site}${f.path}`)}</loc>${f.lastmod ? `<lastmod>${day(f.lastmod)}</lastmod>` : ""}</sitemap>`,
  );
  return `${XML}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</sitemapindex>\n`;
}

/** The newest of several timestamps, or null. */
export function latest(...times: (string | null | undefined)[]): string | null {
  const valid = times.filter((t): t is string => !!t && !Number.isNaN(new Date(t).getTime()));
  return valid.length ? valid.reduce((a, b) => (new Date(a) >= new Date(b) ? a : b)) : null;
}

/** Splits a list into files of at most `size` pages. */
export function chunk<T>(items: T[], size = PAGES_PER_FILE): T[][] {
  const files: T[][] = [];
  for (let i = 0; i < items.length; i += size) files.push(items.slice(i, i + size));
  return files.length ? files : [[]];
}
