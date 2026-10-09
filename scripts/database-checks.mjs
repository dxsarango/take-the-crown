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

/** Columns of readable tables that clients must never read (the active lock's id opens its release). */
export const ANON_HIDDEN_COLUMNS = { profiles: ["user_id"], crown_state: ["active_lock_id"] };

/** The only functions clients may call: pure price and rank math, and name lookup. None is security definer. */
export const CLIENT_FUNCTIONS = ["current_price_cents", "hall_of_fame", "price_at", "profile_id_for_name", "rank_for_seconds"];

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
      for (const role of ["anon", "authenticated"]) {
        const [row] = await query(`select has_column_privilege('${role}', 'public.${table}', '${column}', 'SELECT') as ok`);
        if (row?.ok) problems.push(`${role} can read ${table}.${column}`);
      }
    }
  }
  return problems;
}

/** Clients write nothing directly: every write goes through server code with the service role. */
export async function clientWriteProblems(query) {
  const rows = await query(`
    select c.relname as name, r.role, p.privilege
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) r(role)
    cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(privilege)
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and (has_table_privilege(r.role, c.oid, p.privilege)
        or (p.privilege in ('INSERT', 'UPDATE') and has_any_column_privilege(r.role, c.oid, p.privilege)))
    order by 1, 2, 3`);
  return rows.map((r) => `${r.role} can ${r.privilege.toLowerCase()} ${r.name}`);
}

/** Clients call only the allowlisted functions, and never a security definer one. */
export async function clientFunctionProblems(query) {
  const rows = await query(`
    select distinct p.proname as name, p.prosecdef as definer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    order by 1`);
  return rows
    .filter((r) => r.definer || !CLIENT_FUNCTIONS.includes(r.name))
    .map((r) => `clients can call ${r.name}${r.definer ? " (security definer)" : ", which is not in the allowlist"}`);
}

/** Runs every check; `node scripts/database-checks.mjs <postgres url>` or CHECK_DATABASE_URL. */
export async function checkDatabase(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    const query = async (sql) => (await client.query(sql)).rows;
    return [
      ...(await rlsProblems(query)),
      ...(await anonReadProblems(query)),
      ...(await clientWriteProblems(query)),
      ...(await clientFunctionProblems(query)),
    ];
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
  console.log(problems.length ? `\n${problems.length} problems` : "PASS  row level security on every table; clients read only the allowlist, write nothing and call only safe functions");
  process.exit(problems.length ? 1 : 0);
}
