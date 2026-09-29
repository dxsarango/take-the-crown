import type { AvatarSource, AvatarTraits } from "@/lib/art/avatar";
import { type AchievementCode, isAchievementCode } from "@/lib/game/achievements";
import { type Rank, rankForSeconds } from "@/lib/game/rank";
import type { PublicClient } from "@/lib/supabase/public";

const SUCCESSION_SIZE = 10;
const FEED_SIZE = 6;
const FEED_WINDOW_MS = 24 * 3600 * 1000;

export type Person = {
  profileId: string;
  name: string;
  countryCode: string | null;
  rank: Rank;
  avatar: AvatarSource;
};

export type CrownState = {
  seasonId: number;
  currentReignId: number | null;
  basePriceCents: number;
  baseSetAt: string;
  isLocked: boolean;
  lockExpiresAt: string | null;
  floorCents: number;
  decayBpsPerHour: number;
  lockSeconds: number;
};

export type Season = {
  id: number;
  slug: string;
  name: { en: string; es: string };
  startsAt: string;
  endsAt: string;
};

export type King = Person & {
  reignId: number;
  message: string | null;
  link: string | null;
  startedAt: string;
};

export type PastReign = Person & { reignId: number; durationSeconds: number };

export type HallOfFame = {
  longest: (Person & { seconds: number }) | null;
  most: (Person & { crowns: number }) | null;
  shortest: (Person & { seconds: number }) | null;
};

export type FeedItem =
  | { id: number; createdAt: string; kind: "dethroned"; who: Person; by: Person; durationSeconds: number | null }
  | { id: number; createdAt: string; kind: "first_reign"; who: Person }
  | { id: number; createdAt: string; kind: "achievement"; who: Person; code: AchievementCode };

export type HomeData = {
  /** When the data was read. The first client render uses it so server and client HTML match. */
  readAt: string;
  crown: CrownState;
  season: Season;
  king: King | null;
  succession: PastReign[];
  hallOfFame: HallOfFame;
  feed: FeedItem[];
};

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Failed to load ${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`Failed to load ${what}: no data`);
  return result.data;
}

function payloadField(payload: unknown, key: string): unknown {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)[key]
    : undefined;
}

function asTraits(value: unknown): Partial<AvatarTraits> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<AvatarTraits>) : null;
}

/** Everything the home page shows, read from public tables and views only. */
export async function fetchHomeData(db: PublicClient, now = new Date()): Promise<HomeData> {
  const since = new Date(now.getTime() - FEED_WINDOW_MS).toISOString();

  const [crownRes, configRes, seasonsRes, reignsRes, eventsRes] = await Promise.all([
    db.from("public_crown_state").select("*").single(),
    db.from("app_config").select("lock_seconds").single(),
    db.from("seasons").select("id, slug, name_en, name_es, starts_at, ends_at"),
    db
      .from("public_reigns")
      .select("id, profile_id, name, country_code, message, link, started_at, duration_seconds")
      .order("started_at", { ascending: false })
      .limit(SUCCESSION_SIZE + 1),
    db
      .from("events")
      .select("id, kind, profile_id, created_at, payload")
      .in("kind", ["crown_taken", "achievement_unlocked"])
      .gte("created_at", since)
      .order("id", { ascending: false })
      .limit(FEED_SIZE),
  ]);

  const crownRow = must(crownRes, "crown state");
  const config = must(configRes, "config");
  const seasons = must(seasonsRes, "seasons");
  const reigns = must(reignsRes, "reigns");
  const events = must(eventsRes, "events");

  const seasonRow = seasons.find((s) => s.id === crownRow.season_id);
  if (!seasonRow) throw new Error("Current season not found");

  const leaderboard = must(
    await db
      .from("season_leaderboard")
      .select("profile_id, crowns, longest_seconds, shortest_seconds")
      .eq("season_id", seasonRow.id),
    "season leaderboard",
  );

  // Every profile shown on the page, with its current rank.
  const ids = new Set<string>();
  reigns.forEach((r) => r.profile_id && ids.add(r.profile_id));
  leaderboard.forEach((l) => l.profile_id && ids.add(l.profile_id));
  events.forEach((e) => {
    if (e.profile_id) ids.add(e.profile_id);
    const previous = payloadField(e.payload, "previous_profile_id");
    if (typeof previous === "string") ids.add(previous);
  });

  const people = new Map<string, Person>();
  if (ids.size) {
    const [profilesRes, statsRes] = await Promise.all([
      db.from("profiles").select("id, name, country_code, avatar_seed, avatar_traits").in("id", [...ids]),
      db.from("profile_stats").select("profile_id, total_reign_seconds").in("profile_id", [...ids]),
    ]);
    const stats = must(statsRes, "profile stats");
    for (const p of must(profilesRes, "profiles")) {
      const total = stats.find((s) => s.profile_id === p.id)?.total_reign_seconds ?? 0;
      people.set(p.id, {
        profileId: p.id,
        name: p.name,
        countryCode: p.country_code,
        rank: rankForSeconds(total),
        avatar: { seed: p.avatar_seed, traits: asTraits(p.avatar_traits) },
      });
    }
  }
  const person = (id: unknown) => (typeof id === "string" ? people.get(id) : undefined);

  // Reigns keep the name and country the crown was won with.
  const asReign = (r: (typeof reigns)[number]) => {
    const p = person(r.profile_id);
    return p && r.id !== null ? { ...p, name: r.name ?? p.name, countryCode: r.country_code, reignId: r.id } : null;
  };

  const current = reigns.find((r) => r.id !== null && r.id === crownRow.current_reign_id);
  const currentReign = current ? asReign(current) : null;
  const king: King | null =
    current && currentReign
      ? {
          ...currentReign,
          message: current.message,
          link: current.link,
          startedAt: current.started_at ?? now.toISOString(),
        }
      : null;

  const succession: PastReign[] = reigns
    .filter((r) => r.id !== crownRow.current_reign_id && r.duration_seconds !== null)
    .slice(0, SUCCESSION_SIZE)
    .flatMap((r) => {
      const reign = asReign(r);
      return reign ? [{ ...reign, durationSeconds: r.duration_seconds ?? 0 }] : [];
    });

  type Entry = (typeof leaderboard)[number];
  const top = (value: (l: Entry) => number | null, direction: 1 | -1) =>
    leaderboard
      .filter((l) => value(l) !== null && person(l.profile_id))
      .sort((a, b) => direction * ((value(b) ?? 0) - (value(a) ?? 0)))[0];
  const longest = top((l) => l.longest_seconds, 1);
  const most = top((l) => l.crowns, 1);
  const shortest = top((l) => l.shortest_seconds, -1);
  const withPerson = <T extends object>(entry: Entry | undefined, extra: (e: Entry) => T) => {
    const p = entry && person(entry.profile_id);
    return entry && p ? { ...p, ...extra(entry) } : null;
  };
  const hallOfFame: HallOfFame = {
    longest: withPerson(longest, (e) => ({ seconds: e.longest_seconds ?? 0 })),
    most: withPerson(most, (e) => ({ crowns: e.crowns ?? 0 })),
    shortest: withPerson(shortest, (e) => ({ seconds: e.shortest_seconds ?? 0 })),
  };

  const feed = events.flatMap((e): FeedItem[] => {
    const who = person(e.profile_id);
    if (!who) return [];
    const base = { id: e.id, createdAt: e.created_at };
    if (e.kind === "crown_taken") {
      const previous = person(payloadField(e.payload, "previous_profile_id"));
      if (!previous) return [{ ...base, kind: "first_reign", who }];
      const duration = payloadField(e.payload, "previous_duration_seconds");
      return [
        {
          ...base,
          kind: "dethroned",
          who: previous,
          by: who,
          durationSeconds: typeof duration === "number" ? duration : null,
        },
      ];
    }
    const code = payloadField(e.payload, "code");
    return isAchievementCode(code) ? [{ ...base, kind: "achievement", who, code }] : [];
  });

  return {
    readAt: now.toISOString(),
    crown: {
      seasonId: seasonRow.id,
      currentReignId: crownRow.current_reign_id,
      basePriceCents: crownRow.base_price_cents ?? 0,
      baseSetAt: crownRow.base_set_at ?? now.toISOString(),
      isLocked: crownRow.is_locked ?? false,
      lockExpiresAt: crownRow.lock_expires_at,
      floorCents: crownRow.floor_cents ?? 0,
      decayBpsPerHour: crownRow.decay_bps_per_hour ?? 0,
      lockSeconds: config.lock_seconds,
    },
    season: {
      id: seasonRow.id,
      slug: seasonRow.slug,
      name: { en: seasonRow.name_en, es: seasonRow.name_es },
      startsAt: seasonRow.starts_at,
      endsAt: seasonRow.ends_at,
    },
    king,
    succession,
    hallOfFame,
    feed,
  };
}
