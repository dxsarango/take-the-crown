import "server-only";
import { type AchievementCode, isAchievementCode } from "@/lib/game/achievements";
import type { Person } from "@/lib/home/data";
import type { Rarity } from "@/lib/profile/public";
import { fetchPeople } from "@/lib/realm/data";
import type { PublicClient } from "@/lib/supabase/public";

export const CARD_TEMPLATES = ["victory", "challenge", "achievement", "dethroned"] as const;
export type CardTemplate = (typeof CARD_TEMPLATES)[number];

export const CARD_SIZES = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
} as const;
export type CardSize = keyof typeof CARD_SIZES;

type Base = { seasonId: number; person: Person };

export type CardModel =
  | (Base & { template: "victory"; seconds: number; ended: boolean })
  | (Base & { template: "challenge"; priceCents: number })
  | (Base & { template: "achievement"; code: AchievementCode; rarity: Rarity; achievementSeasonId: number | null; holderPct: number })
  | (Base & { template: "dethroned"; seconds: number; by: Person });

async function reign(db: PublicClient, id: number) {
  const { data } = await db
    .from("public_reigns")
    .select("id, profile_id, season_id, started_at, duration_seconds, ended_at, dethroned_by")
    .eq("id", id)
    .maybeSingle();
  return data?.profile_id && data.season_id !== null && data.started_at ? data : null;
}

async function person(db: PublicClient, profileId: string): Promise<Person | null> {
  return (await fetchPeople(db, [profileId])).get(profileId) ?? null;
}

/**
 * The data a card shows, or null when it does not exist: a victory is any reign, a challenge only
 * the current one (its price is live), a dethroning a reign someone ended by taking the crown.
 * Achievement ids are `<profile id>_<achievement code>`.
 */
export async function cardModel(db: PublicClient, template: CardTemplate, id: string, now = new Date()): Promise<CardModel | null> {
  if (template === "achievement") {
    const [profileId, code] = id.split("_");
    if (!profileId || !isAchievementCode(code)) return null;
    const [earnedRes, achievementRes, statsRes] = await Promise.all([
      db.from("profile_achievements").select("season_id").eq("profile_id", profileId).eq("achievement_code", code).maybeSingle(),
      db.from("achievements").select("rarity, season_id").eq("code", code).maybeSingle(),
      db.from("achievement_stats").select("holder_pct").eq("code", code).maybeSingle(),
    ]);
    const player = earnedRes.data && achievementRes.data ? await person(db, profileId) : null;
    if (!player || !earnedRes.data || !achievementRes.data) return null;
    return {
      template,
      seasonId: earnedRes.data.season_id,
      person: player,
      code,
      rarity: achievementRes.data.rarity,
      achievementSeasonId: achievementRes.data.season_id,
      holderPct: Number(statsRes.data?.holder_pct ?? 0),
    };
  }

  if (!/^\d{1,18}$/.test(id)) return null;
  const row = await reign(db, Number(id));
  if (!row?.profile_id || row.season_id === null || !row.started_at) return null;
  const seconds = row.duration_seconds ?? Math.max(0, Math.floor((now.getTime() - new Date(row.started_at).getTime()) / 1000));

  if (template === "victory") {
    const player = await person(db, row.profile_id);
    return player && { template, seasonId: row.season_id, person: player, seconds, ended: row.ended_at !== null };
  }
  if (template === "challenge") {
    const { data: crown } = await db.from("public_crown_state").select("current_reign_id, price_cents").single();
    if (!crown || crown.current_reign_id !== row.id || crown.price_cents === null) return null;
    const player = await person(db, row.profile_id);
    return player && { template, seasonId: row.season_id, person: player, priceCents: crown.price_cents };
  }
  if (!row.dethroned_by || row.duration_seconds === null) return null;
  const people = await fetchPeople(db, [row.profile_id, row.dethroned_by]);
  const player = people.get(row.profile_id);
  const by = people.get(row.dethroned_by);
  return player && by ? { template, seasonId: row.season_id, person: player, seconds: row.duration_seconds, by } : null;
}
