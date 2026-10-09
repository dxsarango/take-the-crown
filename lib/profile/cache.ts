import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { isAchievementCode } from "@/lib/game/achievements";
import { isRank } from "@/lib/game/rank";
import { HOME_TAG, PUBLIC_DATA_SECONDS } from "@/lib/home/cache";
import { profileCard } from "@/lib/og/metadata";
import { publicClient } from "@/lib/supabase/public";
import { serviceClient } from "@/lib/supabase/service";
import { type ProfilePage, fetchProfilePage, profileIdForName } from "./public";

class UnknownName extends Error {}

const idForName = unstable_cache(
  async (name: string) => {
    const id = await profileIdForName(publicClient(), name);
    // Thrown, not returned, so a miss is never cached: a name claimed a moment later resolves at once.
    if (!id) throw new UnknownName();
    return id;
  },
  ["profile-id-for-name"],
  { revalidate: PUBLIC_DATA_SECONDS, tags: [HOME_TAG] },
);

/** The profile id for a current or former public name, or null. Once per request. */
export const cachedProfileId = cache(async (name: string): Promise<string | null> => {
  try {
    return await idForName(name);
  } catch (e) {
    if (e instanceof UnknownName) return null;
    throw e;
  }
});

export type CachedProfile = { page: ProfilePage | null; banned: boolean };

const profileData = unstable_cache(
  async (profileId: string): Promise<CachedProfile> => {
    const [page, flags] = await Promise.all([
      fetchProfilePage(publicClient(), profileId),
      serviceClient().from("profiles").select("is_banned").eq("id", profileId).maybeSingle(),
    ]);
    if (flags.error) throw new Error(`Failed to load ban flag: ${flags.error.message}`);
    return { page, banned: flags.data?.is_banned === true };
  },
  ["profile-page"],
  { revalidate: PUBLIC_DATA_SECONDS, tags: [HOME_TAG] },
);

/** Everything the public profile shows, plus the ban flag the robots rule needs. Once per request. */
export const cachedProfile = cache(profileData);

const card = unstable_cache((profileId: string, requested: string) => profileCard(publicClient(), profileId, requested || undefined), ["profile-card"], {
  revalidate: PUBLIC_DATA_SECONDS,
  tags: [HOME_TAG],
});

/** The link preview card; any `?card=` that is not an achievement or a rank shares the default's cache entry. */
export function cachedProfileCard(profileId: string, requested: unknown) {
  const valid = typeof requested === "string" && (isAchievementCode(requested) || isRank(requested));
  return card(profileId, valid ? requested : "");
}
