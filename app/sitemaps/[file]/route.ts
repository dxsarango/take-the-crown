import { serverEnv } from "@/lib/env.server";
import { chunk, urlsetXml } from "@/lib/seo-sitemap";
import { sitemapSource } from "@/lib/seo-sitemap-data";
import { XML_HEADERS } from "../headers";

/** `static.xml`, `seasons.xml` and `profiles-<n>.xml`, the files the index lists. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const site = serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const { statics, seasons, profiles } = await sitemapSource();
  const profilesFile = /^profiles-([1-9]\d*)\.xml$/.exec(file);
  const pages = file === "static.xml" ? statics : file === "seasons.xml" ? seasons : profilesFile ? chunk(profiles)[Number(profilesFile[1]) - 1] : undefined;
  if (!pages) return new Response(null, { status: 404 });
  return new Response(urlsetXml(site, pages), { headers: XML_HEADERS });
}
