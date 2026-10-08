import { describe, expect, it } from "vitest";
import { Player, asRole, count, one, q, withFreshGame } from "./helpers";

withFreshGame();

// The public read surface. A new column on a base table never reaches clients through these views
// unless it is added here on purpose.
const VIEW_COLUMNS: Record<string, string[]> = {
  achievement_stats: ["code", "rarity", "holders", "holder_pct"],
  public_crown_state: [
    "season_id",
    "current_reign_id",
    "base_price_cents",
    "base_set_at",
    "is_locked",
    "lock_expires_at",
    "price_cents",
    "floor_cents",
    "step_bps",
    "decay_bps_per_hour",
  ],
  profile_stats: [
    "profile_id",
    "crowns_taken",
    "total_reign_seconds",
    "longest_reign_seconds",
    "times_dethroned",
    "total_spent_cents",
    "rank",
  ],
  season_leaderboard: ["season_id", "profile_id", "crowns", "reign_seconds", "longest_seconds", "shortest_seconds"],
  country_leaderboard: ["season_id", "country_code", "crowns", "reign_seconds", "kings"],
  public_chronicle: [
    "id",
    "season_id",
    "profile_id",
    "name",
    "country_code",
    "started_at",
    "ended_at",
    "end_reason",
    "duration_seconds",
    "from_profile_id",
    "from_name",
    "from_country_code",
    "to_profile_id",
    "to_name",
    "to_country_code",
    "reversed",
  ],
  public_rivalries: ["profile_id", "rival_id", "wins", "losses", "last_at"],
  season_stats: ["season_id", "reigns", "kings", "countries", "longest_seconds", "shortest_seconds", "peak_price_cents"],
  public_reigns: [
    "id",
    "season_id",
    "profile_id",
    "price_paid_cents",
    "name",
    "country_code",
    "message",
    "link",
    "started_at",
    "ended_at",
    "end_reason",
    "dethroned_by",
    "duration_seconds",
    "reversed",
  ],
};

describe("public views", () => {
  it("are exactly the nine documented views", async () => {
    const views = await q<{ viewname: string }>("select viewname from pg_views where schemaname = 'public' order by 1");
    expect(views.map((v) => v.viewname)).toEqual(Object.keys(VIEW_COLUMNS).sort());
  });

  it.each(Object.entries(VIEW_COLUMNS))("%s exposes exactly its listed columns", async (view, columns) => {
    const rows = await q<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
      [view],
    );
    expect(rows.map((r) => r.column_name)).toEqual(columns);
  });

  it.each(Object.keys(VIEW_COLUMNS))("%s says why it runs as its owner", async (view) => {
    const { comment } = await one<{ comment: string | null }>("select obj_description($1::regclass, 'pg_class') as comment", [`public.${view}`]);
    expect(comment).toMatch(/RLS-locked with no policies/);
    expect(comment).toMatch(/security definer/);
  });

  it.each(Object.keys(VIEW_COLUMNS))("%s runs as its owner and is readable by clients", async (view) => {
    const { options } = await one<{ options: string[] | null }>("select reloptions as options from pg_class where oid = $1::regclass", [`public.${view}`]);
    expect(options ?? []).not.toContain("security_invoker=true");
    for (const role of ["anon", "authenticated"]) {
      await expect(asRole(role, (client) => client.query(`select * from ${view} limit 1`))).resolves.toBeDefined();
    }
  });
});

describe("public_reigns prices", () => {
  const prices = (role = "anon") =>
    asRole(role, async (client) => (await client.query<{ price_paid_cents: number | null }>("select price_paid_cents from public_reigns order by id")).rows.map((r) => r.price_paid_cents));

  it("are hidden unless the player shows their total spent, so they cannot be summed back", async () => {
    const ana = new Player("ana");
    const luis = new Player("luis");
    await ana.takeover();
    await luis.takeover();
    expect(await prices()).toEqual([null, null]);

    await q("update profiles set show_total_spent = true where id = $1", [await ana.id()]);
    const shown = await prices();
    expect(shown[0]).toBeGreaterThan(0);
    expect(shown[1]).toBeNull();
    expect(await prices("authenticated")).toEqual(shown);
  });

  it("agree with profile_stats", async () => {
    const ana = new Player("ana");
    await ana.takeover();
    const id = await ana.id();
    const stats = () => asRole("anon", async (c) => (await c.query<{ total_spent_cents: string | null }>("select total_spent_cents from profile_stats where profile_id = $1", [id])).rows[0].total_spent_cents);
    expect(await stats()).toBeNull();
    await q("update profiles set show_total_spent = true where id = $1", [id]);
    const [price] = await prices();
    expect(Number(await stats())).toBe(price);
  });
});

describe("public_chronicle", () => {
  it("says which reigns were reversed", async () => {
    const first = new Player("first");
    const second = new Player("second");
    const a = await first.takeover();
    await second.takeover();
    await q("update reigns set reversed_at = now(), reversal_kind = 'refund' where id = $1", [a.id]);
    const rows = await asRole("anon", async (c) => (await c.query<{ id: string; reversed: boolean }>("select id, reversed from public_chronicle order by id")).rows);
    expect(rows.map((r) => r.reversed)).toEqual([true, false]);
  });
});

describe("foreign key indexes", () => {
  const INDEXED: [string, string][] = [
    ["notifications", "profile_id"],
    ["reigns", "dethroned_by"],
    ["events", "profile_id"],
    ["events", "reign_id"],
    ["price_locks", "profile_id"],
    ["profile_achievements", "achievement_code"],
    ["profile_achievements", "reign_id"],
  ];

  it.each(INDEXED)("%s(%s) has an index to lead with", async (table, column) => {
    const rows = await q<{ first: string }>(
      `select a.attname as first
         from pg_index i
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = $1::regclass and a.attname = $2`,
      [`public.${table}`, column],
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("log tables", () => {
  it.each(["rate_limit_hits", "profile_name_history"])("%s has a bigint identity primary key", async (table) => {
    const rows = await q<{ column_name: string; data_type: string; is_identity: string }>(
      `select c.column_name, c.data_type, c.is_identity
         from information_schema.table_constraints t
         join information_schema.key_column_usage k using (constraint_schema, constraint_name)
         join information_schema.columns c on c.table_schema = k.table_schema and c.table_name = k.table_name and c.column_name = k.column_name
        where t.table_schema = 'public' and t.table_name = $1 and t.constraint_type = 'PRIMARY KEY'`,
      [table],
    );
    expect(rows).toEqual([{ column_name: "id", data_type: "bigint", is_identity: "YES" }]);
  });

  it("still takes repeated rate limit hits", async () => {
    await q("insert into rate_limit_hits (key) values ('same'), ('same')");
    expect(await count("rate_limit_hits", "key = 'same'")).toBe(2);
  });
});
