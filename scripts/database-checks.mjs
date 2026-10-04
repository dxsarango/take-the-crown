// Checks a database's client access, shared by tests/db/deploy-checks.test.ts (local) and
// `pnpm check:db` (a hosted project). Each check takes `query(sql) => rows` and returns the
// problems it found; an empty list means it passed.

import path from "node:path";
import { fileURLToPath } from "node:url";

/** What anon may read: whole tables and views, plus tables readable column by column. */
export const ANON_READABLE = [
  "achievement_stats",
  "achievements",
  "app_config",
  "country_leaderboard",
  "crown_state",
  "events",
  "profile_achievements",
  "profile_name_history",
  "profile_stats",
  "profiles",
  "public_chronicle",
  "public_crown_state",
  "public_reigns",
  "public_rivalries",
  "rank_ups",
  "season_leaderboard",
  "season_stats",
  "seasons",
];

/** Columns of readable tables that anon must never read. */
export const ANON_HIDDEN_COLUMNS = { profiles: ["user_id"] };

/** Every table in the public schema has row level security on. */
export async function rlsProblems(query) {
  const rows = await query(`
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    order by 1`);
  return rows.map((r) => `row level security is off on ${r.name}`);
}

/** The tables and views anon can read (whole, or any column) are exactly the allowlist. */
export async function anonReadProblems(query) {
  const rows = await query(`
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and (has_table_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('anon', c.oid, 'SELECT'))
    order by 1`);
  const readable = rows.map((r) => r.name);
  const problems = [
    ...readable.filter((name) => !ANON_READABLE.includes(name)).map((name) => `anon can read ${name}, which is not in the allowlist`),
    ...ANON_READABLE.filter((name) => !readable.includes(name)).map((name) => `anon cannot read ${name}, which the app needs`),
  ];
  for (const [table, columns] of Object.entries(ANON_HIDDEN_COLUMNS)) {
    for (const column of columns) {
      const [row] = await query(`select has_column_privilege('anon', 'public.${table}', '${column}', 'SELECT') as ok`);
      if (row?.ok) problems.push(`anon can read ${table}.${column}`);
    }
  }
  return problems;
}

/** Runs every check; `node scripts/database-checks.mjs <postgres url>` or CHECK_DATABASE_URL. */
export async function checkDatabase(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    const query = async (sql) => (await client.query(sql)).rows;
    return [...(await rlsProblems(query)), ...(await anonReadProblems(query))];
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.argv[2] ?? process.env.CHECK_DATABASE_URL;
  if (!url) {
    console.error("Usage: pnpm check:db <postgres connection string> (or CHECK_DATABASE_URL)");
    process.exit(2);
  }
  const problems = await checkDatabase(url);
  for (const problem of problems) console.log(`FAIL  ${problem}`);
  console.log(problems.length ? `\n${problems.length} problems` : "PASS  row level security on every table; anon reads only the allowlist");
  process.exit(problems.length ? 1 : 0);
}
