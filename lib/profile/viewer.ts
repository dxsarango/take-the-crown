import type { AvatarSource } from "@/lib/art/avatar";
import { type Rank, rankForSeconds } from "@/lib/game/rank";
import type { PublicClient } from "@/lib/supabase/public";
import { avatarSource } from "./avatar";

/** What the browser knows about the signed-in player (top bar, payment modal). */
export type ViewerSummary = {
  profileId: string;
  name: string;
  countryCode: string | null;
  rank: Rank;
  avatar: AvatarSource;
};

export async function viewerSummary(db: PublicClient, profileId: string): Promise<ViewerSummary | null> {
  const [profileRes, statsRes] = await Promise.all([
    db
      .from("profiles")
      .select("id, name, country_code, avatar_seed, avatar_traits, avatar_mode, avatar_path, avatar_pixelated")
      .eq("id", profileId)
      .maybeSingle(),
    db.from("profile_stats").select("total_reign_seconds").eq("profile_id", profileId).maybeSingle(),
  ]);
  const profile = profileRes.data;
  if (!profile) return null;
  return {
    profileId: profile.id,
    name: profile.name,
    countryCode: profile.country_code,
    rank: rankForSeconds(statsRes.data?.total_reign_seconds ?? 0),
    avatar: avatarSource(profile),
  };
}
