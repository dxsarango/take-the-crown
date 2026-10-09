import { rankForSeconds } from "@/lib/game/rank";
import type { Person, Season } from "@/lib/home/data";
import { avatarSource } from "@/lib/profile/avatar";
import type { PublicClient } from "@/lib/supabase/public";

export const HISTORY_PAGE = 30;
const HALL_SIZE = 10;

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Failed to load ${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`Failed to load ${what}: no data`);
  return result.data;
}

export type SeasonInfo = Season & { closedAt: string | null; kingProfileId: string | null; exclusiveAchievement: string | null; exclusiveFrame: string | null };

export async function fetchSeasons(db: PublicClient): Promise<{ seasons: SeasonInfo[]; currentId: number }> {
  const [seasonsRes, crownRes] = await Promise.all([
    db
      .from("seasons")
      .select("id, slug, name_en, name_es, starts_at, ends_at, closed_at, king_profile_id, exclusive_achievement, exclusive_frame")
      .order("id"),
    db.from("crown_state").select("season_id").single(),
  ]);
  const seasons = must(seasonsRes, "seasons").map((s) => ({
    id: s.id,
    slug: s.slug,
    name: { en: s.name_en, es: s.name_es },
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    closedAt: s.closed_at,
    kingProfileId: s.king_profile_id,
    exclusiveAchievement: s.exclusive_achievement,
    exclusiveFrame: s.exclusive_frame,
  }));
  return { seasons, currentId: must(crownRes, "crown state").season_id };
}

/** Players with their current name, country, rank and avatar. */
export async function fetchPeople(db: PublicClient, ids: Iterable<string>): Promise<Map<string, Person>> {
  const list = [...new Set(ids)];
  const people = new Map<string, Person>();
  if (!list.length) return people;
  const [profilesRes, statsRes] = await Promise.all([
    db
      .from("profiles")
      .select("id, name, country_code, avatar_seed, avatar_traits, avatar_mode, avatar_path, avatar_pixelated")
      .in("id", list),
    db.from("profile_stats").select("profile_id, total_reign_seconds").in("profile_id", list),
  ]);
  const stats = must(statsRes, "profile stats");
  for (const p of must(profilesRes, "profiles")) {
    people.set(p.id, {
      profileId: p.id,
      name: p.name,
      countryCode: p.country_code,
      rank: rankForSeconds(stats.find((s) => s.profile_id === p.id)?.total_reign_seconds ?? 0),
      avatar: avatarSource(p),
    });
  }
  return people;
}

// ---------------------------------------------------------------------------
// Kingdom history
// ---------------------------------------------------------------------------

export type HistoryEntry = Person & {
  reignId: number;
  startedAt: string;
  durationSeconds: number | null;
  message: string | null;
  dethronedBy: string | null;
  open: boolean;
  /** Refunded or charged back after delivery: shown, marked, and counted nowhere. */
  reversed: boolean;
};

export type SeasonSummary = {
  reigns: number;
  kings: number;
  countries: number;
  longestSeconds: number | null;
  shortestSeconds: number | null;
  peakPriceCents: number | null;
};

/** One page of a season's reigns, newest first; `before` is the started_at of the last one shown. */
export async function fetchHistoryPage(db: PublicClient, seasonId: number, before?: string): Promise<HistoryEntry[]> {
  let query = db
    .from("public_reigns")
    .select("id, profile_id, name, country_code, message, started_at, duration_seconds, ended_at, reversed")
    .eq("season_id", seasonId)
    .order("started_at", { ascending: false })
    .limit(HISTORY_PAGE);
  if (before) query = query.lt("started_at", before);
  const reigns = must(await query, "reigns");
  const ids = reigns.flatMap((r) => (r.id === null ? [] : [r.id]));
  const [chronicleRes, people] = await Promise.all([
    ids.length ? db.from("public_chronicle").select("id, to_name").in("id", ids) : Promise.resolve({ data: [], error: null }),
    fetchPeople(
      db,
      reigns.flatMap((r) => (r.profile_id ? [r.profile_id] : [])),
    ),
  ]);
  const to = new Map((must(chronicleRes, "chronicle") as { id: number | null; to_name: string | null }[]).map((c) => [c.id, c.to_name]));
  return reigns.flatMap((r) => {
    const person = r.profile_id ? people.get(r.profile_id) : undefined;
    if (!person || r.id === null || !r.started_at) return [];
    return [
      {
        ...person,
        // Reigns keep the name and country they were won with.
        name: r.name ?? person.name,
        countryCode: r.country_code,
        reignId: r.id,
        startedAt: r.started_at,
        durationSeconds: r.duration_seconds,
        message: r.message,
        dethronedBy: to.get(r.id) ?? null,
        open: r.ended_at === null,
        reversed: r.reversed === true,
      },
    ];
  });
}

export async function fetchSeasonSummary(db: PublicClient, seasonId: number): Promise<SeasonSummary> {
  const { data } = await db.from("season_stats").select("*").eq("season_id", seasonId).maybeSingle();
  return {
    reigns: data?.reigns ?? 0,
    kings: data?.kings ?? 0,
    countries: data?.countries ?? 0,
    longestSeconds: data?.longest_seconds ?? null,
    shortestSeconds: data?.shortest_seconds ?? null,
    peakPriceCents: data?.peak_price_cents ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hall of fame
// ---------------------------------------------------------------------------

export type HallTab = "longest" | "most" | "shortest" | "countries";
export const HALL_TABS: HallTab[] = ["longest", "most", "shortest", "countries"];

export type HallRow =
  | { kind: "person"; person: Person; value: number }
  | { kind: "country"; countryCode: string; value: number; kings: number };

export type HallScope = { tabs: Record<HallTab, HallRow[]> };

type HallRowRaw = { tab: string; profile_id: string | null; country_code: string | null; value: number; kings: number | null };

function scopeRows(rows: HallRowRaw[], people: Map<string, Person>): HallScope {
  const tab = (name: HallTab): HallRow[] =>
    rows
      .filter((r) => r.tab === name)
      .flatMap((r): HallRow[] => {
        if (name === "countries") return r.country_code ? [{ kind: "country", countryCode: r.country_code, value: r.value, kings: r.kings ?? 0 }] : [];
        const person = r.profile_id ? people.get(r.profile_id) : undefined;
        return person ? [{ kind: "person", person, value: r.value }] : [];
      });
  return { tabs: { longest: tab("longest"), most: tab("most"), shortest: tab("shortest"), countries: tab("countries") } };
}

/** The four records for the current season and for all time, ranked by the database. */
export async function fetchHallOfFame(db: PublicClient, seasonId: number): Promise<{ season: HallScope; all: HallScope }> {
  const [seasonRes, allRes] = await Promise.all([
    db.rpc("hall_of_fame", { p_season_id: seasonId, p_limit: HALL_SIZE }),
    db.rpc("hall_of_fame", { p_limit: HALL_SIZE }),
  ]);
  const season = must(seasonRes, "hall of fame") as HallRowRaw[];
  const all = must(allRes, "hall of fame") as HallRowRaw[];
  const people = await fetchPeople(
    db,
    [...season, ...all].flatMap((r) => (r.profile_id ? [r.profile_id] : [])),
  );
  return { season: scopeRows(season, people), all: scopeRows(all, people) };
}

// ---------------------------------------------------------------------------
// Season end
// ---------------------------------------------------------------------------

export type SeasonRecord = { value: number; who: Person | null; at: string | null };

export type SeasonEnd = {
  season: SeasonInfo;
  next: SeasonInfo | null;
  ended: boolean;
  king: (Person & { seconds: number; crowns: number; longestSeconds: number }) | null;
  podium: (Person & { seconds: number })[];
  summary: SeasonSummary;
  longest: SeasonRecord | null;
  shortest: SeasonRecord | null;
  peak: SeasonRecord | null;
  floorCents: number;
  medalCode: string | null;
};

export async function fetchSeasonEnd(db: PublicClient, slug: string): Promise<SeasonEnd | null> {
  const { seasons, currentId } = await fetchSeasons(db);
  const season = seasons.find((s) => s.slug === slug);
  if (!season || season.id > currentId) return null;
  const next = seasons.find((s) => s.id === season.id + 1) ?? null;

  const [boardRes, summary, longestRes, shortestRes, peakRes, configRes] = await Promise.all([
    db.from("season_leaderboard").select("profile_id, crowns, reign_seconds, longest_seconds").eq("season_id", season.id),
    fetchSeasonSummary(db, season.id),
    db
      .from("public_reigns")
      .select("profile_id, duration_seconds, started_at")
      .eq("season_id", season.id)
      .eq("reversed", false)
      .not("duration_seconds", "is", null)
      .order("duration_seconds", { ascending: false })
      .limit(1),
    db
      .from("public_reigns")
      .select("profile_id, duration_seconds, started_at")
      .eq("season_id", season.id)
      .eq("reversed", false)
      .not("duration_seconds", "is", null)
      .order("duration_seconds", { ascending: true })
      .limit(1),
    db
      .from("public_reigns")
      .select("profile_id, price_paid_cents, started_at")
      .eq("season_id", season.id)
      .eq("reversed", false)
      // Players who keep their total spent private have no price in the view: they sort last.
      .order("price_paid_cents", { ascending: false, nullsFirst: false })
      .limit(1),
    db.from("app_config").select("floor_cents").single(),
  ]);
  const board = must(boardRes, "leaderboard")
    .filter((b) => b.profile_id)
    .sort((a, b) => (b.reign_seconds ?? 0) - (a.reign_seconds ?? 0));
  // The peak price is a season total; it names a player only when that player's price is public.
  const peakRow = peakRes.data?.[0];
  const peakNamed =
    peakRow && peakRow.price_paid_cents === summary.peakPriceCents ? peakRes : { data: [{ profile_id: null, started_at: null }] };
  const ids = [
    ...board.slice(0, 3).map((b) => b.profile_id!),
    ...[longestRes, shortestRes, peakNamed].flatMap((r) => (r.data?.[0]?.profile_id ? [r.data[0].profile_id] : [])),
    ...(season.kingProfileId ? [season.kingProfileId] : []),
  ];
  const people = await fetchPeople(db, ids);
  const kingId = season.kingProfileId ?? board[0]?.profile_id ?? null;
  const kingBoard = board.find((b) => b.profile_id === kingId);
  const king = kingId && people.get(kingId) && kingBoard
    ? {
        ...people.get(kingId)!,
        seconds: kingBoard.reign_seconds ?? 0,
        crowns: kingBoard.crowns ?? 0,
        longestSeconds: kingBoard.longest_seconds ?? 0,
      }
    : null;
  const record = (
    res: { data: { profile_id: string | null; started_at: string | null }[] | null },
    value: number | null,
  ): SeasonRecord | null => {
    const row = res.data?.[0];
    if (!row || value === null) return null;
    return { value, who: row.profile_id ? (people.get(row.profile_id) ?? null) : null, at: row.started_at };
  };

  return {
    season,
    next,
    ended: season.closedAt !== null || season.id < currentId,
    king,
    podium: board.slice(0, 3).flatMap((b) => {
      const p = people.get(b.profile_id!);
      return p ? [{ ...p, seconds: b.reign_seconds ?? 0 }] : [];
    }),
    summary,
    // Records name who set them, so they come from finished reigns.
    longest: record(longestRes, longestRes.data?.[0]?.duration_seconds ?? null),
    shortest: record(shortestRes, shortestRes.data?.[0]?.duration_seconds ?? null),
    peak: record(peakNamed, summary.peakPriceCents),
    floorCents: must(configRes, "config").floor_cents,
    medalCode: season.exclusiveAchievement,
  };
}
