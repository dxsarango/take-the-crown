import pg from "pg";
import { DB_URL } from "../../tests/db/db-url";
import { seedKingdom } from "./kingdom";

// The two profiles of design/prototypes/Perfil.dc.html on top of the throne room fixture:
// priya_ships, a veteran Duke with a rivalry, and maru.jpg, a new player dethroned after 11 s.

const HOUR = 3600;

export const VETERAN = { name: "priya_ships", email: "priyaships@test.local" };
export const NEWCOMER = { name: "maru.jpg", email: "marujpg@test.local" };

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function idOf(client: pg.Client, name: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>("select id from profiles where name = $1", [name]);
  return rows[0].id;
}

/** Consecutive reigns (by id) that hand the crown from one player to the next. */
async function chain(client: pg.Client, season: number, startedAgo: number, reigns: { name: string; country: string; seconds: number }[]) {
  let ago = startedAgo;
  const ids: { id: number; profileId: string }[] = [];
  for (const r of reigns) {
    const profileId = await idOf(client, r.name);
    const { rows } = await client.query<{ id: number }>(
      `insert into reigns (season_id, profile_id, price_paid_cents, name, country_code, started_at, ended_at, end_reason)
       values ($1, $2, 900, $3, $4, now() - make_interval(secs => $5), now() - make_interval(secs => $5) + make_interval(secs => $6), 'dethroned')
       returning id`,
      [season, profileId, r.name, r.country, ago, r.seconds],
    );
    ids.push({ id: rows[0].id, profileId });
    ago -= r.seconds;
  }
  for (let i = 0; i < ids.length - 1; i++) {
    await client.query("update reigns set dethroned_by = $2 where id = $1", [ids[i].id, ids[i + 1].profileId]);
  }
}

async function award(client: pg.Client, profileId: string, codes: string[], earnedAgo: number) {
  for (const code of codes) {
    await client.query(
      `insert into profile_achievements (profile_id, achievement_code, season_id, earned_at)
       values ($1, $2, 0, now() - make_interval(secs => $3))`,
      [profileId, code, earnedAgo],
    );
  }
}

export async function seedProfiles(): Promise<void> {
  await seedKingdom();
  await withClient(async (client) => {
    // The throne room's line of succession hands the crown down in order.
    await client.query(`
      update reigns r set dethroned_by = n.profile_id
      from reigns n
      where r.end_reason = 'dethroned' and r.dethroned_by is null and n.id = r.id + 1
        and abs(extract(epoch from (n.started_at - r.ended_at))) < 5`);

    const { rows } = await client.query<{ id: string }>(
      `insert into profiles (name, country_code, main_link, created_at) values ($1, 'CL', 'https://maruprints.cl', now() - interval '3 days') returning id`,
      [NEWCOMER.name],
    );
    const maru = rows[0].id;
    await client.query("insert into profile_private (profile_id, email) values ($1, $2)", [maru, NEWCOMER.email]);

    // priya_ships and kenji trade the crown; maru.jpg reigns 11 s before danielkim takes it.
    await chain(client, 0, 400 * HOUR, [
      { name: "kenji", country: "JP", seconds: 2 * HOUR },
      { name: "priya_ships", country: "IN", seconds: 9 * HOUR + 58 * 60 },
      { name: "kenji", country: "JP", seconds: 3 * HOUR },
      { name: "priya_ships", country: "IN", seconds: 26 * HOUR + 40 * 60 },
      { name: "kenji", country: "JP", seconds: 1 * HOUR },
      { name: "priya_ships", country: "IN", seconds: 4 * HOUR + 12 * 60 },
      { name: "kenji", country: "JP", seconds: 30 * 60 },
    ]);
    await chain(client, 0, 60 * HOUR, [
      { name: "jules", country: "FR", seconds: 20 * 60 },
      { name: NEWCOMER.name, country: "CL", seconds: 11 },
      { name: "danielkim", country: "KR", seconds: 40 * 60 },
    ]);

    const priya = await idOf(client, VETERAN.name);
    await award(client, priya, ["founder", "guardian_2", "regicide", "night_owl", "bargain_hunter", "revenge", "guardian_1", "patriot", "collector", "rivalry"], 200 * HOUR);
    await award(client, maru, ["founder", "one_minute_king"], 60 * HOUR);
    await client.query(
      `update profiles set showcase = '{founder,guardian_2,regicide}', main_link = 'https://lumen-notes.app',
         link_x = 'https://x.com/priya_ships', link_github = 'https://github.com/priyaships', created_at = now() - interval '14 days'
       where id = $1`,
      [priya],
    );
    await client.query("update profiles set showcase = '{founder,one_minute_king}' where id = $1", [maru]);
  });
}
