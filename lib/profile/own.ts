import "server-only";
import { avatarTraits } from "@/lib/art/avatar";
import { type AchievementCode, isAchievementCode } from "@/lib/game/achievements";
import { type Rank, rankForSeconds } from "@/lib/game/rank";
import { serviceClient } from "@/lib/supabase/service";
import { asTraits, avatarFileUrl } from "./avatar";
import type { Rarity } from "./public";
import type { SettingsForm } from "./settings";
import { PLATFORMS, SOCIAL_KEYS, socialHandle } from "./socials";

export type EarnedMedal = { code: AchievementCode; rarity: Rarity; seasonId: number | null };

/** Everything edit profile needs about the signed-in player, private fields included. */
export type OwnSettings = {
  /** When this was read; the page clock starts here. */
  readAt: string;
  profileId: string;
  email: string;
  avatarSeed: string;
  rank: Rank;
  form: SettingsForm;
  /** URLs of the stored upload, when there is one. */
  upload: { path: string; pixelUrl: string; originalUrl: string } | null;
  earned: EarnedMedal[];
  /** When the public name can change again, or null if it can now. */
  nameChangeAt: string | null;
  floorCents: number;
  decayBpsPerHour: number;
  basePriceCents: number;
  baseSetAt: string;
};

export async function fetchOwnSettings(profileId: string): Promise<OwnSettings | null> {
  const db = serviceClient();
  const [profileRes, privateRes, statsRes, earnedRes, achievementsRes, configRes, crownRes] = await Promise.all([
    db.from("profiles").select("*").eq("id", profileId).maybeSingle(),
    db.from("profile_private").select("*").eq("profile_id", profileId).maybeSingle(),
    db.from("profile_stats").select("total_reign_seconds").eq("profile_id", profileId).maybeSingle(),
    db.from("profile_achievements").select("achievement_code").eq("profile_id", profileId),
    db.from("achievements").select("code, rarity, season_id, sort_order").order("sort_order"),
    db.from("app_config").select("name_change_days, floor_cents").single(),
    db.from("public_crown_state").select("base_price_cents, base_set_at, decay_bps_per_hour").single(),
  ]);
  const profile = profileRes.data;
  const priv = privateRes.data;
  const config = configRes.data;
  const crown = crownRes.data;
  if (!profile || !priv || !config || !crown) return null;

  const earnedCodes = new Set((earnedRes.data ?? []).map((e) => e.achievement_code));
  const earned: EarnedMedal[] = (achievementsRes.data ?? [])
    .filter((a) => isAchievementCode(a.code) && earnedCodes.has(a.code))
    .map((a) => ({ code: a.code as AchievementCode, rarity: a.rarity, seasonId: a.season_id }));

  const changeAt = profile.name_changed_at
    ? new Date(new Date(profile.name_changed_at).getTime() + config.name_change_days * 86_400_000)
    : null;
  const path = profile.avatar_path;

  return {
    readAt: new Date().toISOString(),
    profileId,
    email: priv.email,
    avatarSeed: profile.avatar_seed,
    rank: rankForSeconds(statsRes.data?.total_reign_seconds ?? 0),
    form: {
      avatarMode: profile.avatar_mode === "upload" ? "upload" : "generated",
      avatarTraits: avatarTraits({ seed: profile.avatar_seed, traits: asTraits(profile.avatar_traits) }),
      avatarPath: path,
      avatarPixelated: profile.avatar_pixelated,
      name: profile.name,
      country: profile.country_code,
      link: profile.main_link ? profile.main_link.replace(/^https:\/\//, "") : "",
      socials: Object.fromEntries(
        SOCIAL_KEYS.map((k) => [k, socialHandle(k, profile[PLATFORMS[k].column as keyof typeof profile] as string | null)]),
      ) as SettingsForm["socials"],
      showcase: profile.showcase.filter(isAchievementCode),
      showRival: profile.show_rival,
      showChronicle: profile.show_chronicle,
      alertsDethroned: priv.alerts_dethroned,
      priceOn: priv.alerts_price_below_cents !== null,
      price: String(Math.round((priv.alerts_price_below_cents ?? 2000) / 100)),
      alertsSeasonStart: priv.alerts_season_start,
      locale: priv.locale === "es" ? "es" : "en",
    },
    upload: path ? { path, pixelUrl: avatarFileUrl(path, "pixel"), originalUrl: avatarFileUrl(path, "original") } : null,
    earned,
    nameChangeAt: changeAt && changeAt.getTime() > Date.now() ? changeAt.toISOString() : null,
    floorCents: config.floor_cents,
    decayBpsPerHour: crown.decay_bps_per_hour ?? 0,
    basePriceCents: crown.base_price_cents ?? config.floor_cents,
    baseSetAt: crown.base_set_at ?? new Date().toISOString(),
  };
}
