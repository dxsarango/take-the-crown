// Invented data for the recordings, written straight to the local database the way the e2e fixtures
// do. Only four players: dario (the buyer), kenji (the king), sofia and max.

import pg from "pg";
import { traitsFromUsername } from "../../design/lib/avatar-lib.js";
import { applyDevSeed, resetToSeed } from "../../tests/db/reset.ts";

export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const DARIO = { name: "dario", email: "dario@test.local" };

const HOUR = 3600;
const MIN = 60;

const PEOPLE = {
  kenji: { country: "JP", email: "kenji@test.local" },
  sofia: { country: "AR", email: "sofia@test.local" },
  max: { country: "DE", email: "max@test.local" },
  dario: { country: "ES", email: DARIO.email },
};

// Oldest first: [who, seconds reigned, price in cents]. Kenji holds the crown at the end.
const SUCCESSION_WITHOUT_DARIO = [
  ["max", 38 * MIN, 500],
  ["sofia", 1 * HOUR + 24 * MIN, 900],
  ["kenji", 26 * HOUR + 40 * MIN, 1500],
  ["max", 52 * MIN, 1900],
  ["sofia", 3 * HOUR + 10 * MIN, 2100],
  ["max", 21 * MIN, 2400],
];
const SUCCESSION_WITH_DARIO = [
  ["max", 38 * MIN, 500],
  ["sofia", 1 * HOUR + 24 * MIN, 900],
  ["kenji", 26 * HOUR + 40 * MIN, 1500],
  ["dario", 2 * HOUR + 5 * MIN, 1900],
  ["sofia", 35 * MIN, 2100],
  ["dario", 48 * MIN, 2200],
  ["max", 3 * HOUR + 20 * MIN, 2400],
  ["sofia", 1 * HOUR + 2 * MIN, 2500],
  ["dario", 4 * HOUR + 15 * MIN, 2600],
  ["max", 28 * MIN, 2800],
];
const KING = {
  startedAgo: 2 * HOUR + 14 * MIN,
  price: 3000,
  message: "Shipping a tiny habit tracker. Free while in beta.",
  link: "https://habitpixel.app",
};

const DARIO_AWARDS = ["founder", "bargain_hunter", "regicide", "revenge", "guardian_1", "patriot"];

async function withClient(fn) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function addProfile(client, name, mainLink = null) {
  const person = PEOPLE[name];
  const { rows } = await client.query(
    `insert into profiles (name, country_code, avatar_traits, main_link, created_at)
     values ($1, $2, $3, $4, now() - interval '9 days') returning id`,
    [name, person.country, JSON.stringify(traitsFromUsername(name)), mainLink],
  );
  await client.query("insert into profile_private (profile_id, email) values ($1, $2)", [rows[0].id, person.email]);
  return rows[0].id;
}

async function addReign(client, { season, profileId, name, startedAgo, seconds, price, message = null, link = null }) {
  const { rows } = await client.query(
    `insert into reigns (season_id, profile_id, price_paid_cents, name, country_code, message, link, started_at, ended_at, end_reason)
     values ($1, $2, $3, $4, $5, $6, $7,
       now() - make_interval(secs => $8),
       case when $9::int is null then null else now() - make_interval(secs => $8) + make_interval(secs => $9::int) end,
       case when $9::int is null then null else 'dethroned'::reign_end_reason end)
     returning id`,
    [season, profileId, price, name, PEOPLE[name].country, message, link, startedAgo, seconds],
  );
  return rows[0].id;
}

/**
 * Resets the local database and seeds season 0 with kenji on the throne.
 * `dario: "absent"` leaves him unknown (he buys in the recording); `"veteran"` gives him a profile
 * with reigns and achievements, minus `withhold` (what an achievement recording unlocks live).
 */
export async function seedWorld({ dario, withhold = [] }) {
  await withClient(async (client) => {
    await resetToSeed(client, ["profile_name_history"]);
    await applyDevSeed(client);

    const ids = {};
    for (const name of ["kenji", "sofia", "max"]) ids[name] = await addProfile(client, name);
    if (dario === "veteran") ids.dario = await addProfile(client, "dario", "https://dario-labs.app");

    const succession = dario === "veteran" ? SUCCESSION_WITH_DARIO : SUCCESSION_WITHOUT_DARIO;
    // Rank padding lives in another season, like the e2e fixtures, so this season's hall stays tidy.
    const padding = { kenji: 30 * HOUR, sofia: 9 * HOUR, max: 5 * HOUR, ...(dario === "veteran" ? { dario: 20 * HOUR } : {}) };
    for (const [name, seconds] of Object.entries(padding)) {
      await addReign(client, { season: 2, profileId: ids[name], name, startedAgo: 900 * HOUR, seconds, price: 500 });
    }

    let ago = KING.startedAgo + succession.reduce((sum, [, seconds]) => sum + seconds, 0);
    const reigns = [];
    for (const [name, seconds, price] of succession) {
      const id = await addReign(client, { season: 0, profileId: ids[name], name, startedAgo: ago, seconds, price });
      reigns.push({ id, name, seconds, price });
      ago -= seconds;
    }
    const kingReign = await addReign(client, {
      season: 0,
      profileId: ids.kenji,
      name: "kenji",
      startedAgo: KING.startedAgo,
      seconds: null,
      price: KING.price,
      message: KING.message,
      link: KING.link,
    });
    const chain = [...reigns, { id: kingReign, name: "kenji" }];
    for (let i = 0; i < chain.length - 1; i++) {
      await client.query("update reigns set dethroned_by = $2 where id = $1", [chain[i].id, ids[chain[i + 1].name]]);
    }
    await client.query("update crown_state set current_reign_id = $1, base_price_cents = $2, base_set_at = now() - interval '2 hours'", [
      kingReign,
      KING.price + 800,
    ]);

    // The last proclamations, newest last.
    const event = (kind, name, secondsAgo, payload, reignId = null) =>
      client.query(
        `insert into events (kind, season_id, profile_id, reign_id, payload, created_at)
         values ($1, 0, $2, $3, $4, now() - make_interval(secs => $5))`,
        [kind, ids[name], reignId, JSON.stringify(payload), secondsAgo],
      );
    const last = reigns.at(-1);
    const before = reigns.at(-2);
    await event(
      "crown_taken",
      last.name,
      KING.startedAgo + last.seconds,
      { price_cents: last.price, previous_profile_id: ids[before.name], previous_duration_seconds: before.seconds },
      last.id,
    );
    await event(
      "crown_taken",
      "kenji",
      KING.startedAgo,
      { price_cents: KING.price, previous_profile_id: ids[last.name], previous_duration_seconds: last.seconds },
      kingReign,
    );
    await event("achievement_unlocked", "sofia", 5 * HOUR, { code: "guardian_1" });

    if (dario === "veteran") {
      let earnedAgo = 300 * HOUR;
      for (const code of DARIO_AWARDS.filter((c) => !withhold.includes(c))) {
        earnedAgo -= 30 * HOUR;
        await client.query(
          `insert into profile_achievements (profile_id, achievement_code, season_id, earned_at)
           values ($1, $2, 0, now() - make_interval(secs => $3))`,
          [ids.dario, code, earnedAgo],
        );
      }
      await client.query("update profiles set showcase = '{founder,regicide,guardian_1}' where id = $1", [ids.dario]);
    }
  });
}

/** Leaves the local database as `supabase db reset` would. */
export function resetWorld() {
  return withClient(async (client) => {
    await resetToSeed(client, ["profile_name_history"]);
    await applyDevSeed(client);
  });
}

/** Every recording signs dario in from the same address; the per-hour link limit would stop the second. */
export function clearSignInLimits() {
  return withClient((client) => client.query("delete from rate_limit_hits where key like 'magic_link%'"));
}

/** Awards dario an achievement the way the game does: the row, and the event the toast listens for. */
export function unlock(code) {
  return withClient(async (client) => {
    const { rows } = await client.query("select id from profiles where name = $1", [DARIO.name]);
    await client.query("insert into profile_achievements (profile_id, achievement_code, season_id) values ($1, $2, 0)", [rows[0].id, code]);
    await client.query("insert into events (kind, season_id, profile_id, payload) values ('achievement_unlocked', 0, $1, $2)", [
      rows[0].id,
      JSON.stringify({ code }),
    ]);
  });
}
