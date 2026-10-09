import "server-only";
import { unstable_cache } from "next/cache";
import { HOME_TAG, PUBLIC_DATA_SECONDS } from "@/lib/home/cache";
import { seasonCard } from "@/lib/og/metadata";
import { publicClient } from "@/lib/supabase/public";
import { fetchHallOfFame, fetchHistoryPage, fetchSeasonEnd, fetchSeasonSummary } from "./data";

/** The records only move when a reign ends: a short cache keeps a traffic spike off the database. */
export const cachedHallOfFame = unstable_cache((seasonId: number) => fetchHallOfFame(publicClient(), seasonId), ["hall-of-fame"], {
  revalidate: 30,
  tags: [HOME_TAG],
});

/** The first page of a season's history and its summary. */
export const cachedKingdom = unstable_cache(
  async (seasonId: number) => {
    const db = publicClient();
    const [entries, summary] = await Promise.all([fetchHistoryPage(db, seasonId), fetchSeasonSummary(db, seasonId)]);
    return { entries, summary };
  },
  ["kingdom"],
  { revalidate: PUBLIC_DATA_SECONDS, tags: [HOME_TAG] },
);

/** A season page's data. Callers pass only slugs of seasons that exist, so the keys stay few. */
export const cachedSeasonEnd = unstable_cache((slug: string) => fetchSeasonEnd(publicClient(), slug), ["season-end"], {
  revalidate: PUBLIC_DATA_SECONDS,
  tags: [HOME_TAG],
});

/** What a season's link preview names: its king and the card. */
export const cachedSeasonShare = unstable_cache(
  async (seasonId: number, kingProfileId: string | null) => {
    const db = publicClient();
    const [king, card] = await Promise.all([
      kingProfileId ? db.from("profiles").select("name").eq("id", kingProfileId).maybeSingle() : null,
      seasonCard(db, seasonId, kingProfileId),
    ]);
    return { kingName: king?.data?.name ?? null, card };
  },
  ["season-share"],
  { revalidate: PUBLIC_DATA_SECONDS, tags: [HOME_TAG] },
);
