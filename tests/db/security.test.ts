import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { Player, asRole, count, createLock, q, withFreshGame } from "./helpers";

withFreshGame();

const CLIENT_ROLES = ["anon", "authenticated"] as const;
const WRITE_PRIVILEGES = ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;

/** Tables and views the browser can see: exactly these, read-only. */
const PUBLIC_READ = [
  "achievement_stats",
  "achievements",
  "app_config",
  "country_leaderboard",
  "crown_state",
  "events",
  "profile_achievements",
  "profile_stats",
  "profiles",
  "public_crown_state",
  "public_reigns",
  "season_leaderboard",
  "seasons",
];

type Relation = { name: string; kind: string };

async function relations(): Promise<Relation[]> {
  return q<Relation>(`
    select c.relname as name, c.relkind::text as kind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
    order by 1
  `);
}

async function securityDefinerFunctions(): Promise<{ signature: string }[]> {
  return q<{ signature: string }>(`
    select p.oid::regprocedure::text as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
    order by 1
  `);
}

describe("privileges", () => {
  it("has row level security on every table", async () => {
    const rows = await q<{ name: string }>(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `);
    expect(rows).toEqual([]);
  });

  for (const role of CLIENT_ROLES) {
    it(`gives ${role} no write privilege on any table or view`, async () => {
      const granted: string[] = [];
      for (const relation of await relations()) {
        for (const privilege of WRITE_PRIVILEGES) {
          const [row] = await q<{ ok: boolean }>("select has_table_privilege($1, $2, $3) as ok", [
            role,
            `public.${relation.name}`,
            privilege,
          ]);
          if (row.ok) granted.push(`${relation.name}: ${privilege}`);
        }
      }
      expect(granted).toEqual([]);
    });

    it(`lets ${role} read only the public tables and views`, async () => {
      const readable: string[] = [];
      for (const relation of await relations()) {
        const [row] = await q<{ ok: boolean }>("select has_table_privilege($1, $2, 'SELECT') as ok", [
          role,
          `public.${relation.name}`,
        ]);
        if (row.ok) readable.push(relation.name);
      }
      // Signed-in players read their own profile_private row through the own_read policy.
      const expected = role === "authenticated" ? [...PUBLIC_READ, "profile_private"].sort() : PUBLIC_READ;
      expect(readable).toEqual(expected);
    });

    it(`gives ${role} no execute privilege on security definer functions`, async () => {
      const functions = await securityDefinerFunctions();
      expect(functions.length).toBeGreaterThan(0);
      const executable: string[] = [];
      for (const fn of functions) {
        const [row] = await q<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [
          role,
          fn.signature,
        ]);
        if (row.ok) executable.push(fn.signature);
      }
      expect(executable).toEqual([]);
    });

    it(`lets ${role} write nothing through any grant path`, async () => {
      // Direct attempts, in case a privilege check above misses an inherited grant.
      await new Player("king").takeover();
      const attempts = [
        "insert into app_config default values",
        // PostgREST sessions reject UPDATE/DELETE without WHERE (safeupdate), so add one.
        "update app_config set floor_cents = 1 where true",
        "update crown_state set base_price_cents = 1 where true",
        "update reigns set message = 'hacked' where true",
        "update public_reigns set message = 'hacked' where true",
        "update public_reigns set display_name = 'hacked' where true",
        "delete from events where true",
        "truncate reigns cascade",
        "update profiles set is_banned = true where true",
        "insert into payments (lock_id, provider, provider_payment_id, amount_cents, currency, email) select id, 'x', 'x', 1, 'USD', 'x' from price_locks limit 1",
      ];
      for (const sql of attempts) {
        await expect(
          asRole(role, (client) => client.query(sql), { sub: randomUUID(), role }),
          `${role}: ${sql}`,
        ).rejects.toThrow(/permission denied|cannot update column/);
      }
      expect(await count("reigns", "message = 'hacked' or display_name = 'hacked'")).toBe(0);
    });

    it(`refuses ${role} calls to the takeover functions`, async () => {
      const lock = await createLock();
      const calls = [
        "select create_price_lock('a@b.co', 'ip', null, 'x', null, null, null, null, 'en')",
        `select release_price_lock('${lock.id}')`,
        `select record_paid_payment('test', 'evt', 'pay', '${lock.id}', 99999, 'USD', 'a@b.co')`,
        "select rollover_season()",
        "select check_live_achievements()",
        `select ensure_profile_for_user('${randomUUID()}', 'a@b.co', 'x')`,
      ];
      for (const sql of calls) {
        await expect(asRole(role, (client) => client.query(sql)), `${role}: ${sql}`).rejects.toThrow(
          /permission denied/,
        );
      }
    });
  }
});

describe("row level security", () => {
  beforeEach(async () => {
    await new Player("first").takeover();
    await new Player("second").takeover();
    await createLock();
  });

  for (const role of CLIENT_ROLES) {
    it(`hides private tables from ${role}`, async () => {
      for (const table of ["profile_private", "price_locks", "payments", "webhook_events", "notifications", "reports"]) {
        const result = await asRole(role, (client) => client.query(`select * from ${table}`)).catch(
          (error: Error) => error,
        );
        if (result instanceof Error) {
          expect(result.message, table).toMatch(/permission denied/);
        } else {
          expect(result.rows, table).toEqual([]);
        }
      }
    });

    it(`shows public data to ${role}`, async () => {
      const reigns = await asRole(role, (client) => client.query("select * from public_reigns"));
      expect(reigns.rows).toHaveLength(2);
      const state = await asRole(role, (client) => client.query("select * from public_crown_state"));
      expect(state.rows[0]).toMatchObject({ is_locked: true, price_cents: 720 });
    });
  }

  it("shows a signed-in player only their own private row", async () => {
    const [owner] = await q<{ profile_id: string }>("select profile_id from profile_private limit 1");
    const userId = randomUUID();
    await q("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [
      userId,
      `rls_${userId.slice(0, 8)}@test.local`,
    ]);
    await q("update profiles set user_id = $2 where id = $1", [owner.profile_id, userId]);

    const own = await asRole("authenticated", (client) => client.query("select profile_id from profile_private"), {
      sub: userId,
      role: "authenticated",
    });
    expect(own.rows).toEqual([{ profile_id: owner.profile_id }]);
  });

  it("hides moderated messages and links in public_reigns", async () => {
    await q("update reigns set message = 'secret', link = 'https://x.test', message_hidden = true");
    const rows = await asRole("anon", (client) => client.query("select message, link from public_reigns"));
    expect(rows.rows.every((row) => row.message === null && row.link === null)).toBe(true);
  });
});
