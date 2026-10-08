import "server-only";
import { unstable_cache } from "next/cache";
import { isFormerName } from "@/lib/game/former";
import { HOME_TAG } from "@/lib/home/cache";
import { fetchSeasons } from "@/lib/realm/data";
import { latest, legalLastmod, notAfter, type SitemapPage } from "@/lib/seo-sitemap";
import { publicClient } from "@/lib/supabase/public";
import { serviceClient } from "@/lib/supabase/service";

const PAGE = 1000;

/** Reads a whole table or view, a page at a time (the API caps a request at 1,000 rows). */
async function readAll<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error(`Sitemap read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

const LEGAL = ["/rules", "/faq", "/terms", "/privacy"];

export type SitemapSource = { statics: SitemapPage[]; seasons: SitemapPage[]; profiles: SitemapPage[] };

async function readSitemapSource(): Promise<SitemapSource> {
  const db = publicClient();
  const service = serviceClient();
  const [{ seasons, currentId }, reigns, people, config] = await Promise.all([
    fetchSeasons(db),
    readAll((from, to) =>
      db.from("public_reigns").select("season_id, profile_id, started_at, ended_at").eq("reversed", false).order("id").range(from, to),
    ),
    readAll((from, to) => service.from("profiles").select("id, name, is_banned").order("id").range(from, to)),
    service.from("app_config").select("updated_at, legal_effective_date").single(),
  ]);

  // The newest change per season and per player, and overall.
  const bySeason = new Map<number, string | null>();
  const byProfile = new Map<string, string | null>();
  let overall: string | null = null;
  for (const r of reigns) {
    const when = latest(r.started_at, r.ended_at);
    overall = latest(overall, when);
    if (r.season_id !== null) bySeason.set(r.season_id, latest(bySeason.get(r.season_id), when));
    if (r.profile_id) byProfile.set(r.profile_id, latest(byProfile.get(r.profile_id), when));
  }

  const now = new Date();
  const legalChanged = legalLastmod(config.data, now);
  return {
    statics: [
      { route: "", lastmod: overall },
      { route: "/kingdom", lastmod: overall },
      { route: "/hall-of-fame", lastmod: overall },
      ...LEGAL.map((route) => ({ route, lastmod: legalChanged })),
    ],
    seasons: seasons.filter((s) => s.id <= currentId).map((s) => ({ route: `/seasons/${s.slug}`, lastmod: latest(bySeason.get(s.id), notAfter(s.startsAt, now)) })),
    // Players who have reigned and are not suspended or deleted: the same rule as their page's robots tag.
    profiles: people
      .filter((p) => !p.is_banned && !isFormerName(p.name) && byProfile.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ route: `/u/${p.name.toLowerCase()}`, lastmod: byProfile.get(p.id) })),
  };
}

/**
 * Regenerated hourly, and as soon as a takeover or a content change revalidates the home data (the
 * same tag). Development reads the database every time.
 */
export const sitemapSource =
  process.env.NODE_ENV === "production"
    ? unstable_cache(readSitemapSource, ["sitemap-source"], { revalidate: 3600, tags: [HOME_TAG] })
    : readSitemapSource;
