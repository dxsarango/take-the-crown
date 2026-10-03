import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { serverEnv } from "@/lib/env.server";

const PAGES = ["", "/kingdom", "/hall-of-fame", "/rules", "/faq", "/terms", "/privacy"];

/** The fixed public pages in each language; profiles and seasons are reached by links. */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = serverEnv().NEXT_PUBLIC_SITE_URL;
  return PAGES.map((page) => ({
    url: `${site}/${routing.defaultLocale}${page}`,
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, `${site}/${l}${page}`])) },
  }));
}
