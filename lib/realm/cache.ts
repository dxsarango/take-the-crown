import "server-only";
import { unstable_cache } from "next/cache";
import { HOME_TAG } from "@/lib/home/cache";
import { publicClient } from "@/lib/supabase/public";
import { fetchHallOfFame } from "./data";

/** The records only move when a reign ends: a short cache keeps a traffic spike off the database. */
export const cachedHallOfFame = unstable_cache((seasonId: number) => fetchHallOfFame(publicClient(), seasonId), ["hall-of-fame"], {
  revalidate: 30,
  tags: [HOME_TAG],
});
