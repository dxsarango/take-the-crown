import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

// Mirrors the seasons after supabase/migrations/0021_season_continuity.sql. Slugs are parked first,
// so rows can take each other's slugs.
const SEED_SEASONS = `
  update seasons set slug = slug || '-reset';
  insert into seasons (id, slug, name_en, name_es, skin, starts_at, ends_at, exclusive_achievement, exclusive_frame, name_final, art_final) values
    (0, 'genesis', 'Genesis', 'Génesis', 'genesis', '2026-10-01 00:00+00', '2026-12-01 00:00+00', 'founder', 'genesis', true, true),
    (1, 'frost', 'Frost', 'Escarcha', 'frost', '2026-12-01 00:00+00', '2027-01-01 00:00+00', 'frostbound', 'frost', true, false),
    (2, 'season-2', 'January 2027', 'Enero 2027', 'provisional', '2027-01-01 00:00+00', '2027-02-01 00:00+00', null, null, false, false),
    (3, 'season-3', 'February 2027', 'Febrero 2027', 'provisional', '2027-02-01 00:00+00', '2027-03-01 00:00+00', null, null, false, false),
    (4, 'season-4', 'March 2027', 'Marzo 2027', 'provisional', '2027-03-01 00:00+00', '2027-04-01 00:00+00', null, null, false, false),
    (5, 'season-5', 'April 2027', 'Abril 2027', 'provisional', '2027-04-01 00:00+00', '2027-05-01 00:00+00', null, null, false, false),
    (6, 'season-6', 'May 2027', 'Mayo 2027', 'provisional', '2027-05-01 00:00+00', '2027-06-01 00:00+00', null, null, false, false),
    (7, 'season-7', 'June 2027', 'Junio 2027', 'provisional', '2027-06-01 00:00+00', '2027-07-01 00:00+00', null, null, false, false),
    (8, 'season-8', 'July 2027', 'Julio 2027', 'provisional', '2027-07-01 00:00+00', '2027-08-01 00:00+00', null, null, false, false),
    (9, 'season-9', 'August 2027', 'Agosto 2027', 'provisional', '2027-08-01 00:00+00', '2027-09-01 00:00+00', null, null, false, false),
    (10, 'season-10', 'September 2027', 'Septiembre 2027', 'provisional', '2027-09-01 00:00+00', '2027-10-01 00:00+00', null, null, false, false),
    (11, 'season-11', 'October 2027', 'Octubre 2027', 'provisional', '2027-10-01 00:00+00', '2027-11-01 00:00+00', null, null, false, false),
    (12, 'day-of-the-dead', 'Day of the Dead', 'Día de Muertos', 'day-of-the-dead', '2027-11-01 00:00+00', '2027-12-01 00:00+00', 'remembered', 'day-of-the-dead', true, true)
  on conflict (id) do update set
    slug = excluded.slug, name_en = excluded.name_en, name_es = excluded.name_es, skin = excluded.skin,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, exclusive_achievement = excluded.exclusive_achievement,
    exclusive_frame = excluded.exclusive_frame, name_final = excluded.name_final, art_final = excluded.art_final,
    ready_alert_at = null, king_profile_id = null, closed_at = null`;

const GAME_TABLES = [
  "rate_limit_hits",
  "notifications",
  "reports",
  "events",
  "profile_achievements",
  "crown_state",
  "reigns",
  "webhook_events",
  "payments",
  "price_locks",
  "profile_private",
  "profiles",
];

async function existingTables(client: pg.ClientBase, names: string[]): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>(
    "select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname = any($1)",
    [names],
  );
  return names.filter((name) => rows.some((row) => row.name === name));
}

const DEADLOCK = "40P01";

/**
 * Realtime's change poller reads these tables whenever a client has subscribed, and a truncate that
 * locks them one by one can deadlock with it. Postgres cancels one side; retrying the truncate is safe.
 */
async function truncate(client: pg.ClientBase, tables: string[]): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.query(`truncate ${tables.join(", ")} restart identity cascade`);
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== DEADLOCK || attempt >= 5) throw error;
    }
  }
}

/** Empties all game data and restores config, seasons and the crown to the migration seed. */
export async function resetToSeed(client: pg.ClientBase, extraTables: string[] = []): Promise<void> {
  const tables = await existingTables(client, [...extraTables, ...GAME_TABLES]);
  await truncate(client, tables);
  await client.query("delete from auth.users where email like '%@test.local'");
  await client.query("delete from app_config");
  await client.query("insert into app_config default values");
  // A new database starts in prelaunch (migration 0019); the game tests play the launched game.
  await client.query("update app_config set prelaunch = false");
  await client.query("delete from seasons where id > 12");
  await client.query("update achievements set active = true");
  await client.query(SEED_SEASONS);
  await client.query("insert into crown_state (season_id, base_price_cents) values (0, 500)");
}

/** Re-applies the local development seed, as `supabase db reset` does. */
export async function applyDevSeed(client: pg.ClientBase): Promise<void> {
  await client.query(readFileSync(path.join(process.cwd(), "supabase", "seed.sql"), "utf8"));
}
