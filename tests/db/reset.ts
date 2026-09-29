import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

// Mirrors the seed in supabase/migrations/0001_init.sql.
const SEED_SEASONS = `
  insert into seasons (id, slug, name_en, name_es, skin, starts_at, ends_at, exclusive_achievement, exclusive_frame) values
    (0, 'genesis', 'Genesis', 'Génesis', 'genesis', '2026-10-01 00:00+00', '2026-11-01 00:00+00', 'founder', 'genesis'),
    (1, 'day-of-the-dead', 'Day of the Dead', 'Día de Muertos', 'day-of-the-dead', '2026-11-01 00:00+00', '2026-12-01 00:00+00', 'remembered', 'day-of-the-dead'),
    (2, 'frost', 'Frost', 'Escarcha', 'frost', '2026-12-01 00:00+00', '2027-01-01 00:00+00', null, null)
  on conflict (id) do update set
    slug = excluded.slug, name_en = excluded.name_en, name_es = excluded.name_es, skin = excluded.skin,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, exclusive_achievement = excluded.exclusive_achievement,
    exclusive_frame = excluded.exclusive_frame, king_profile_id = null, closed_at = null`;

const GAME_TABLES = [
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
  await client.query("delete from seasons where id > 2");
  await client.query("update achievements set active = true");
  await client.query(SEED_SEASONS);
  await client.query("insert into crown_state (season_id, base_price_cents) values (0, 500)");
}

/** Re-applies the local development seed, as `supabase db reset` does. */
export async function applyDevSeed(client: pg.ClientBase): Promise<void> {
  await client.query(readFileSync(path.join(process.cwd(), "supabase", "seed.sql"), "utf8"));
}
