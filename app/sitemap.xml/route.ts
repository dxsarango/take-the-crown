import { siteUrl } from "@/lib/site";
import { chunk, latest, sitemapIndexXml } from "@/lib/seo-sitemap";
import { sitemapSource } from "@/lib/seo-sitemap-data";
import { XML_HEADERS } from "../sitemaps/headers";

/** The sitemap index: static pages, seasons and players, each in files of at most 40,000 URLs. */
export async function GET() {
  const site = siteUrl();
  const { statics, seasons, profiles } = await sitemapSource();
  const files = [
    { path: "/sitemaps/static.xml", lastmod: latest(...statics.map((p) => p.lastmod)) },
    { path: "/sitemaps/seasons.xml", lastmod: latest(...seasons.map((p) => p.lastmod)) },
    ...chunk(profiles).map((pages, i) => ({ path: `/sitemaps/profiles-${i + 1}.xml`, lastmod: latest(...pages.map((p) => p.lastmod)) })),
  ];
  return new Response(sitemapIndexXml(site, files), { headers: XML_HEADERS });
}
