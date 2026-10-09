import { describe, expect, it } from "vitest";
import { Player, ageCurrentReign, asRole, q, withFreshGame } from "./helpers";

withFreshGame();

type Row = { tab: string; profile_id: string | null; country_code: string | null; value: string | number; kings: number | null };
const hall = (season: number | null, limit = 10) =>
  asRole("anon", async (client) =>
    (await client.query<Row>("select * from hall_of_fame($1, $2)", [season, limit])).rows.map((r) => ({ ...r, value: Number(r.value) })),
  );
const tab = (rows: Row[], name: string) => rows.filter((r) => r.tab === name);

/** Closed reigns for players who never held the crown for long: thousands of rows, beyond PostgREST's cap. */
async function crowd(players: number): Promise<void> {
  await q(
    `with p as (
       insert into profiles (name, country_code)
       select 'filler' || n, 'PE' from generate_series(1, $1) n returning id
     )
     insert into reigns (season_id, profile_id, price_paid_cents, name, country_code, started_at, ended_at, end_reason)
     select 0, id, 100, 'filler', 'PE', now() - interval '3 days', now() - interval '3 days' + interval '30 seconds', 'dethroned' from p`,
    [players],
  );
}

describe("hall_of_fame", () => {
  it("ranks the records of one season and of all time, the longest first", async () => {
    const long = new Player("long", "EC");
    const short = new Player("short", "PE");
    const last = new Player("last", "EC");
    await long.takeover();
    await ageCurrentReign(5 * 3600);
    await short.takeover();
    await ageCurrentReign(60);
    await last.takeover();
    const [longId, shortId] = [await long.id(), await short.id()];

    const rows = await hall(null);
    expect(tab(rows, "longest")[0]).toMatchObject({ profile_id: longId, value: expect.any(Number) });
    expect(tab(rows, "longest")[0].value).toBeGreaterThanOrEqual(5 * 3600);
    expect(tab(rows, "shortest")[0].profile_id).toBe(shortId);
    expect(tab(rows, "most")).toHaveLength(3);
    // Ecuador: two kings, the longer reigns; Peru: one.
    expect(tab(rows, "countries").map((c) => [c.country_code, c.kings])).toEqual([
      ["EC", 2],
      ["PE", 1],
    ]);
    expect(await hall(0)).toEqual(rows);
    expect(await hall(99)).toEqual([]);
  });

  it("counts a king once per country for all time, however many seasons they reigned", async () => {
    const ana = new Player("ana", "EC");
    await ana.takeover();
    await ageCurrentReign(120);
    await new Player("bo", "EC").takeover();
    await ageCurrentReign(60);
    await ana.takeover();
    const countries = tab(await hall(null), "countries");
    expect(countries).toHaveLength(1);
    expect(countries[0].kings).toBe(2);
  });

  it("leaves reversed reigns out", async () => {
    const cheat = new Player("cheat", "BR");
    await cheat.takeover();
    await ageCurrentReign(10 * 3600);
    await new Player("next", "EC").takeover();
    await q("update reigns set reversed_at = now(), reversal_kind = 'refund' where profile_id = $1", [await cheat.id()]);
    const rows = await hall(null);
    expect(tab(rows, "countries").map((c) => c.country_code)).not.toContain("BR");
    expect(tab(rows, "longest").map((r) => r.profile_id)).not.toContain(await cheat.id());
  });

  it("returns only the top rows, and the right ones, however many players there are", async () => {
    const king = new Player("king", "EC");
    await king.takeover();
    await ageCurrentReign(9 * 3600);
    await new Player("heir", "EC").takeover();
    await crowd(1500);

    const rows = await hall(null, 10);
    expect(rows.length).toBeLessThanOrEqual(40);
    expect(tab(rows, "longest")).toHaveLength(10);
    expect(tab(rows, "longest")[0].profile_id).toBe(await king.id());
    expect(tab(rows, "shortest")[0].value).toBeLessThanOrEqual(30);
    // Peru's 1500 fillers beat Ecuador's two kings in seconds on the board, and are counted as kings.
    const peru = tab(rows, "countries").find((c) => c.country_code === "PE");
    expect(peru?.kings).toBe(1500);
  });
});

describe("foreign key indexes", () => {
  it("covers every foreign key except the three tables that stay tiny", async () => {
    const missing = await q<{ fk: string }>(
      `select c.conrelid::regclass || '.' || a.attname as fk
       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace
         and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and (i.indkey::int2[])[0] = a.attnum)
       order by 1`,
    );
    const tiny = ["crown_state", "achievements", "admin_actions"];
    expect(missing.map((m) => m.fk).filter((fk) => !tiny.some((t) => fk.startsWith(t + ".")))).toEqual([]);
  });
});
