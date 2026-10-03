import type { AvatarSource } from "@/lib/art/avatar";
import { type AchievementCode, isAchievementCode } from "@/lib/game/achievements";
import { type Rank, rankForSeconds } from "@/lib/game/rank";
import type { CrownState, Season } from "@/lib/home/data";
import type { PublicClient } from "@/lib/supabase/public";
import { avatarSource } from "./avatar";
import { PLATFORMS, SOCIAL_KEYS, type SocialKey } from "./socials";

const CHRONICLE_LIMIT = 500;

export type Rarity = "common" | "rare" | "epic" | "legendary" | "seasonal";

export type ProfileAchievement = {
  code: AchievementCode;
  rarity: Rarity;
  /** Where a seasonal achievement belongs; its ring takes that season's color. */
  seasonId: number | null;
  earnedAt: string | null;
  holderPct: number;
};

export type ChronicleEntry = {
  reignId: number;
  startedAt: string;
  durationSeconds: number | null;
  from: { name: string; countryCode: string | null } | null;
  to: { name: string; countryCode: string | null } | null;
  open: boolean;
};

export type Collectible = {
  seasonId: number;
  frame: "genesis" | "marigold" | null;
  status: "earned" | "open" | "missed" | "upcoming";
  startsAt: string;
  endsAt: string;
};

export type RivalSummary = {
  name: string;
  countryCode: string | null;
  avatar: AvatarSource;
  rank: Rank;
  wins: number;
  losses: number;
  lastAt: string;
};

export type ProfilePage = {
  readAt: string;
  profileId: string;
  name: string;
  countryCode: string | null;
  avatar: AvatarSource;
  rank: Rank;
  joinedAt: string;
  mainLink: string | null;
  socials: { key: SocialKey; url: string }[];
  showcase: AchievementCode[];
  showRival: boolean;
  showChronicle: boolean;
  stats: { totalSeconds: number; longestSeconds: number; crowns: number; dethroned: number };
  achievements: ProfileAchievement[];
  chronicle: ChronicleEntry[];
  chronicleTotal: number;
  rival: RivalSummary | null;
  collectibles: Collectible[];
  season: Season;
  crown: CrownState;
  king: { name: string; countryCode: string | null; avatar: AvatarSource; rank: Rank; startedAt: string; profileId: string } | null;
};

const FRAME_ART: Record<string, Collectible["frame"]> = { genesis: "genesis", "day-of-the-dead": "marigold" };

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Failed to load ${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`Failed to load ${what}: no data`);
  return result.data;
}

/** The profile id for a current or former public name, or null. */
export async function profileIdForName(db: PublicClient, name: string): Promise<string | null> {
  const { data, error } = await db.rpc("profile_id_for_name", { p_name: name });
  if (error) throw new Error(`Failed to resolve name: ${error.message}`);
  return data ?? null;
}

async function rankOf(db: PublicClient, profileId: string): Promise<Rank> {
  const { data } = await db.from("profile_stats").select("total_reign_seconds").eq("profile_id", profileId).maybeSingle();
  return rankForSeconds(data?.total_reign_seconds ?? 0);
}

/** Everything the public profile shows, from public tables and views only. */
export async function fetchProfilePage(db: PublicClient, profileId: string, now = new Date()): Promise<ProfilePage | null> {
  const [profileRes, statsRes, chronicleRes, earnedRes, achievementsRes, holdersRes, rivalRes, seasonsRes, crownRes, configRes] =
    await Promise.all([
      db
        .from("profiles")
        .select(
          "id, name, country_code, avatar_seed, avatar_traits, avatar_mode, avatar_path, avatar_pixelated, created_at, main_link, link_website, link_x, link_youtube, link_tiktok, link_instagram, link_github, link_linkedin, showcase, show_rival, show_chronicle",
        )
        .eq("id", profileId)
        .maybeSingle(),
      db.from("profile_stats").select("*").eq("profile_id", profileId).maybeSingle(),
      db
        .from("public_chronicle")
        .select("id, started_at, duration_seconds, ended_at, from_name, from_country_code, to_name, to_country_code", {
          count: "exact",
        })
        .eq("profile_id", profileId)
        .order("started_at", { ascending: false })
        .limit(CHRONICLE_LIMIT),
      db.from("profile_achievements").select("achievement_code, earned_at, season_id").eq("profile_id", profileId),
      db.from("achievements").select("code, rarity, season_id, sort_order").eq("active", true).order("sort_order"),
      db.from("achievement_stats").select("code, holder_pct"),
      db
        .from("public_rivalries")
        .select("rival_id, wins, losses, last_at")
        .eq("profile_id", profileId)
        .order("last_at", { ascending: false }),
      db.from("seasons").select("id, slug, name_en, name_es, starts_at, ends_at, exclusive_achievement, exclusive_frame").order("id"),
      db.from("public_crown_state").select("*").single(),
      db.from("app_config").select("lock_seconds, max_message_length, prelaunch").single(),
    ]);

  const profile = profileRes.data;
  if (!profile) return null;
  const stats = statsRes.data;
  const chronicle = must(chronicleRes, "chronicle");
  const earned = must(earnedRes, "achievements earned");
  const seasons = must(seasonsRes, "seasons");
  const crownRow = must(crownRes, "crown state");
  const config = must(configRes, "config");

  const seasonRow = seasons.find((s) => s.id === crownRow.season_id);
  if (!seasonRow) throw new Error("Current season not found");
  const season: Season = {
    id: seasonRow.id,
    slug: seasonRow.slug,
    name: { en: seasonRow.name_en, es: seasonRow.name_es },
    startsAt: seasonRow.starts_at,
    endsAt: seasonRow.ends_at,
  };

  const earnedAt = new Map(earned.map((e) => [e.achievement_code, e.earned_at]));
  const earnedIn = new Map(earned.map((e) => [e.achievement_code, e.season_id]));
  const holders = new Map((holdersRes.data ?? []).map((h) => [h.code, Number(h.holder_pct ?? 0)]));
  // Seasonal achievements of seasons that have not started stay hidden (design: Remembered from T1).
  const achievements: ProfileAchievement[] = must(achievementsRes, "achievements")
    .filter((a) => isAchievementCode(a.code) && (a.season_id === null || a.season_id <= season.id))
    .map((a) => ({
      code: a.code as AchievementCode,
      rarity: a.rarity,
      // Seasonal rings keep the color of the season the medal was earned in.
      seasonId: earnedIn.get(a.code) ?? a.season_id,
      earnedAt: earnedAt.get(a.code) ?? null,
      holderPct: holders.get(a.code) ?? 0,
    }));

  // Main rival: the most crowns traded, then the most recent clash.
  const rivals = (rivalRes.data ?? [])
    .filter((r) => r.rival_id && r.wins !== null && r.losses !== null && r.last_at)
    .sort((a, b) => (b.wins! + b.losses!) - (a.wins! + a.losses!) || b.last_at!.localeCompare(a.last_at!));
  let rival: RivalSummary | null = null;
  if (rivals[0]) {
    const top = rivals[0];
    const { data: other } = await db
      .from("profiles")
      .select("id, name, country_code, avatar_seed, avatar_traits, avatar_mode, avatar_path, avatar_pixelated")
      .eq("id", top.rival_id!)
      .maybeSingle();
    if (other) {
      rival = {
        name: other.name,
        countryCode: other.country_code,
        avatar: avatarSource(other),
        rank: await rankOf(db, other.id),
        wins: top.wins!,
        losses: top.losses!,
        lastAt: top.last_at!,
      };
    }
  }

  const collectibles: Collectible[] = seasons
    .filter((s) => s.id <= season.id + 1)
    .map((s) => {
      const has = s.exclusive_achievement ? earnedAt.has(s.exclusive_achievement) : false;
      const status: Collectible["status"] =
        s.id > season.id ? "upcoming" : has ? "earned" : s.id === season.id ? "open" : "missed";
      return {
        seasonId: s.id,
        frame: s.exclusive_frame ? (FRAME_ART[s.exclusive_frame] ?? null) : null,
        status,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
      };
    })
    // Past and current seasons show their frame; the next one is a mystery card.
    .filter((c) => c.status === "upcoming" || c.frame !== null);

  let king: ProfilePage["king"] = null;
  if (crownRow.current_reign_id) {
    const { data: reign } = await db
      .from("public_reigns")
      .select("profile_id, name, country_code, started_at")
      .eq("id", crownRow.current_reign_id)
      .maybeSingle();
    if (reign?.profile_id) {
      const { data: kp } = await db
        .from("profiles")
        .select("id, avatar_seed, avatar_traits, avatar_mode, avatar_path, avatar_pixelated")
        .eq("id", reign.profile_id)
        .maybeSingle();
      if (kp && reign.name && reign.started_at) {
        king = {
          profileId: kp.id,
          name: reign.name,
          countryCode: reign.country_code,
          avatar: avatarSource(kp),
          rank: await rankOf(db, kp.id),
          startedAt: reign.started_at,
        };
      }
    }
  }

  return {
    readAt: now.toISOString(),
    profileId: profile.id,
    name: profile.name,
    countryCode: profile.country_code,
    avatar: avatarSource(profile),
    rank: rankForSeconds(stats?.total_reign_seconds ?? 0),
    joinedAt: profile.created_at,
    mainLink: profile.main_link,
    socials: SOCIAL_KEYS.flatMap((key) => {
      const url = profile[PLATFORMS[key].column as keyof typeof profile];
      return typeof url === "string" && url ? [{ key, url }] : [];
    }),
    showcase: profile.showcase.filter(isAchievementCode),
    showRival: profile.show_rival,
    showChronicle: profile.show_chronicle,
    stats: {
      totalSeconds: stats?.total_reign_seconds ?? 0,
      longestSeconds: stats?.longest_reign_seconds ?? 0,
      crowns: stats?.crowns_taken ?? 0,
      dethroned: stats?.times_dethroned ?? 0,
    },
    achievements,
    chronicle: chronicle.map((c) => ({
      reignId: c.id!,
      startedAt: c.started_at!,
      durationSeconds: c.duration_seconds,
      from: c.from_name ? { name: c.from_name, countryCode: c.from_country_code } : null,
      to: c.to_name ? { name: c.to_name, countryCode: c.to_country_code } : null,
      open: c.ended_at === null,
    })),
    chronicleTotal: chronicleRes.count ?? chronicle.length,
    rival,
    collectibles,
    season,
    crown: {
      seasonId: crownRow.season_id!,
      currentReignId: crownRow.current_reign_id,
      basePriceCents: crownRow.base_price_cents!,
      baseSetAt: crownRow.base_set_at!,
      isLocked: crownRow.is_locked ?? false,
      lockExpiresAt: crownRow.lock_expires_at,
      floorCents: crownRow.floor_cents!,
      decayBpsPerHour: crownRow.decay_bps_per_hour!,
      lockSeconds: config.lock_seconds,
      maxMessageLength: config.max_message_length,
      prelaunch: config.prelaunch,
    },
    king,
  };
}
