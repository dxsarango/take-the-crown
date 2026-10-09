import pg from "pg";
import { traitsFromUsername } from "../../design/lib/avatar-lib.js";
import { DB_URL } from "../../tests/db/db-url";
import { applyDevSeed, resetToSeed } from "../../tests/db/reset";
import { dropPublicCache } from "./cache";

// Local database fixtures for UI tests. Rows are inserted directly: the game logic itself is
// covered by the database suite, and screenshots need exact names, durations and ranks.

const HOUR = 3600;

type Player = { name: string; country: string };

// The prototype's cast (design/prototypes/Portada.dc.html).
const KING = { name: "valeruiz", country: "AR" };
const SUCCESSION: (Player & { seconds: number })[] = [
  { name: "kenji", country: "JP", seconds: 3 * HOUR + 12 * 60 },
  { name: "ana.codes", country: "MX", seconds: 47 * 60 },
  { name: "priya_ships", country: "IN", seconds: 11 * HOUR + 5 * 60 },
  { name: "lucas.fm", country: "BR", seconds: 38 },
  { name: "sorenh", country: "DK", seconds: 1 * HOUR + 54 * 60 },
  { name: "mbali", country: "ZA", seconds: 6 * HOUR + 20 * 60 },
  { name: "jules", country: "FR", seconds: 22 * 60 },
  { name: "danielkim", country: "KR", seconds: 2 * HOUR + 48 * 60 },
  { name: "camila.vc", country: "CO", seconds: 9 * 60 },
  { name: "theo_builds", country: "GB", seconds: 14 * HOUR + 33 * 60 },
];

// Total reign time per player, so ranks match the prototype (duke, count, knight…).
const TOTAL_HOURS: Record<string, number> = {
  valeruiz: 80,
  kenji: 30,
  "ana.codes": 2,
  priya_ships: 75,
  "lucas.fm": 0,
  sorenh: 7,
  mbali: 26,
  jules: 1.5,
  danielkim: 8,
  "camila.vc": 0,
  theo_builds: 170,
};

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
    await dropPublicCache();
  }
}

/** Seed state with `season` open since yesterday and the previous one closed. */
async function resetTo(client: pg.Client, season: 0 | 1): Promise<void> {
  // A request still in flight from the previous test could otherwise recreate a profile for its
  // signed-in user between the truncate and the seed.
  await client.query("delete from auth.users where email like '%@test.local'");
  await resetToSeed(client, ["profile_name_history"]);
  await applyDevSeed(client);
  if (season === 1) {
    await client.query(
      `update seasons set starts_at = now() - interval '40 days', ends_at = now() - interval '1 day', closed_at = now() where id = 0`,
    );
    await client.query(`update seasons set starts_at = now() - interval '1 day' where id = 1`);
    await client.query(`update crown_state set season_id = 1`);
  }
}

async function createProfile(client: pg.Client, player: Player): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into profiles (name, country_code, avatar_traits) values ($1, $2, $3) returning id`,
    [player.name, player.country, JSON.stringify(traitsFromUsername(player.name))],
  );
  await client.query(`insert into profile_private (profile_id, email) values ($1, $2)`, [
    rows[0].id,
    `${player.name.replace(/[^a-z0-9]/gi, "")}@test.local`,
  ]);
  return rows[0].id;
}

async function addReign(
  client: pg.Client,
  input: {
    season: number;
    profileId: string;
    player: Player;
    startedAgo: number;
    seconds: number | null;
    message?: string;
    link?: string;
    price?: number;
  },
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `insert into reigns (season_id, profile_id, price_paid_cents, name, country_code, message, link, started_at, ended_at, end_reason)
     values ($1, $2, $3, $4, $5, $6, $7,
       now() - make_interval(secs => $8),
       case when $9::int is null then null else now() - make_interval(secs => $8) + make_interval(secs => $9::int) end,
       case when $9::int is null then null else 'dethroned'::reign_end_reason end)
     returning id`,
    [
      input.season,
      input.profileId,
      input.price ?? 500,
      input.player.name,
      input.player.country,
      input.message ?? null,
      input.link ?? null,
      input.startedAgo,
      input.seconds,
    ],
  );
  return rows[0].id;
}

export type KingdomOptions = {
  season?: 0 | 1;
  /** No reigns at all: the empty throne at the start of a season. */
  empty?: boolean;
  /** Someone else holds a price lock with this many seconds left. */
  lockSecondsLeft?: number;
  /** The price has decayed to the floor. */
  atFloor?: boolean;
};

/** Resets the local database and seeds the throne room shown in the design. */
export async function seedKingdom(options: KingdomOptions = {}): Promise<void> {
  const season = options.season ?? 0;
  const otherSeason = season === 0 ? 2 : 0;
  await withClient(async (client) => {
    await resetTo(client, season);
    if (options.empty) return;

    const ids = new Map<string, string>();
    for (const player of [KING, ...SUCCESSION]) ids.set(player.name, await createProfile(client, player));
    const id = (name: string) => ids.get(name) ?? "";

    // Rank padding lives in another season so this season's hall of fame stays as designed.
    for (const [name, hours] of Object.entries(TOTAL_HOURS)) {
      if (hours === 0) continue;
      await addReign(client, {
        season: otherSeason,
        profileId: id(name),
        player: { name, country: "AR" },
        startedAgo: 900 * HOUR,
        seconds: Math.round(hours * HOUR),
      });
    }

    // Older reigns this season: kenji's 14 crowns and theo's 31h 07m record.
    for (let i = 0; i < 13; i++) {
      await addReign(client, {
        season,
        profileId: id("kenji"),
        player: SUCCESSION[0],
        startedAgo: (200 + i) * HOUR,
        seconds: 20 * 60,
      });
    }
    await addReign(client, {
      season,
      profileId: id("theo_builds"),
      player: SUCCESSION[9],
      startedAgo: 150 * HOUR,
      seconds: 31 * HOUR + 7 * 60,
    });

    // The line of succession, oldest first, ending when the king took the crown.
    const kingStartedAgo = 5 * HOUR + 41 * 60 + 9;
    let endedAgo = kingStartedAgo;

    for (const player of SUCCESSION) {
      const startedAgo = endedAgo + player.seconds;
      await addReign(client, { season, profileId: id(player.name), player, startedAgo, seconds: player.seconds });
      endedAgo = startedAgo;
    }
    const kingReign = await addReign(client, {
      season,
      profileId: id(KING.name),
      player: KING,
      startedAgo: kingStartedAgo,
      seconds: null,
      message: "Built a budget app for freelancers in Latam. Free for the first 1,000 users.",
      link: "https://pesito.app",
      price: 2833,
    });

    await client.query(
      `update crown_state set current_reign_id = $1, base_price_cents = 3400, base_set_at = now()`,
      [kingReign],
    );
    if (options.atFloor) {
      await client.query(`update crown_state set base_set_at = now() - interval '200 hours'`);
    }

    // Proclamations from the last day, newest last.
    const event = (kind: string, profileId: string, ago: number, payload: object, reignId: number | null = null) =>
      client.query(
        `insert into events (kind, season_id, profile_id, reign_id, payload, created_at)
         values ($1, $2, $3, $4, $5, now() - make_interval(secs => $6))`,
        [kind, season, profileId, reignId, JSON.stringify(payload), ago],
      );
    await event("achievement_unlocked", id("mbali"), 22 * HOUR, { code: "patriot" });
    await event("crown_taken", id("ana.codes"), 20 * HOUR, {
      price_cents: 900,
      previous_profile_id: id("lucas.fm"),
      previous_duration_seconds: 38,
    });
    await event("achievement_unlocked", id("priya_ships"), 9 * HOUR, { code: "guardian_1" });
    await event("crown_taken", id("kenji"), 8 * HOUR, {
      price_cents: 1500,
      previous_profile_id: id("ana.codes"),
      previous_duration_seconds: 47 * 60,
    });
    await event("achievement_unlocked", id("kenji"), 8 * HOUR - 5, { code: "revenge" });
    await event(
      "crown_taken",
      id(KING.name),
      kingStartedAgo,
      { price_cents: 2833, previous_profile_id: id("kenji"), previous_duration_seconds: 3 * HOUR + 12 * 60 },
      kingReign,
    );

    if (options.lockSecondsLeft) {
      const { rows } = await client.query<{ id: string }>(
        `insert into price_locks (email, ip_hash, season_id, expected_reign_id, price_cents, name, expires_at)
         values ('buyer@test.local', 'fixture', $1, $2, 3400, 'someone', now() + make_interval(secs => $3))
         returning id`,
        [season, kingReign, options.lockSecondsLeft],
      );
      await client.query(`update crown_state set active_lock_id = $1, active_lock_expires_at = now() + make_interval(secs => $2)`, [
        rows[0].id,
        options.lockSecondsLeft,
      ]);
    }
  });
}

/** Leaves the local database as `supabase db reset` would. */
export async function resetKingdom(): Promise<void> {
  await withClient(async (client) => {
    await resetToSeed(client, ["profile_name_history"]);
    await applyDevSeed(client);
  });
}
