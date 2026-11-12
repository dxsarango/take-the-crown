import { describe, expect, it } from "vitest";
import { Player, asRole, count, one, q, svc, withFreshGame } from "./helpers";

withFreshGame();

type Hail = { status: string; hails: number };

const hail = async (reignId: number, key: string, ip: string | null, profileId: string | null = null): Promise<Hail> =>
  (await svc<{ hail_reign: Hail }>("select hail_reign($1, $2, $3, $4)", [reignId, key, ip, profileId]))[0].hail_reign;

describe("hail_reign", () => {
  it("counts a hail for the current reign, once per device", async () => {
    const reign = await new Player("king").takeover();
    expect(await hail(reign.id, "d:one", "ip-1")).toEqual({ status: "created", hails: 1 });
    expect(await hail(reign.id, "d:one", "ip-1")).toEqual({ status: "duplicate", hails: 1 });
    expect(await hail(reign.id, "d:two", "ip-2")).toEqual({ status: "created", hails: 2 });
    expect(await one("select hails from reign_hail_counts where reign_id = $1", [reign.id])).toEqual({ hails: 2 });
    expect(await count("reign_hails")).toBe(2);
  });

  it("lets a signed-in player hail once, under their account", async () => {
    const reign = await new Player("king").takeover();
    const fan = new Player("fan");
    await fan.takeover();
    await new Player("newer").takeover();
    const current = await one<{ id: number }>("select current_reign_id as id from crown_state");
    const fanId = await fan.id();
    expect(await hail(current.id, `p:${fanId}`, "ip-1", fanId)).toEqual({ status: "created", hails: 1 });
    expect(await hail(current.id, `p:${fanId}`, "ip-2", fanId)).toEqual({ status: "duplicate", hails: 1 });
    expect(await one("select profile_id from reign_hails where reign_id = $1", [current.id])).toEqual({ profile_id: fanId });
    expect(reign.id).not.toBe(current.id);
  });

  it("refuses a king hailing themselves", async () => {
    const king = new Player("king");
    const reign = await king.takeover();
    const id = await king.id();
    expect(await hail(reign.id, `p:${id}`, "ip-1", id)).toEqual({ status: "own_reign", hails: 0 });
    expect(await count("reign_hails")).toBe(0);
  });

  it("refuses a reign that is over, or one that never existed", async () => {
    const old = await new Player("old").takeover();
    await new Player("new").takeover();
    expect(await hail(old.id, "d:one", "ip-1")).toEqual({ status: "not_current", hails: 0 });
    expect(await hail(999_999, "d:one", "ip-1")).toEqual({ status: "not_current", hails: 0 });
    expect(await count("reign_hails")).toBe(0);
  });

  it("starts every reign at zero and keeps the count of the one that ended", async () => {
    const first = await new Player("first").takeover();
    await hail(first.id, "d:one", "ip-1");
    const second = await new Player("second").takeover();
    expect(await q("select hails from reign_hail_counts where reign_id = $1", [second.id])).toEqual([]);
    expect(await one("select hails from reign_hail_counts where reign_id = $1", [first.id])).toEqual({ hails: 1 });
  });

  it("limits visitors without an account per address and reign, but not repeats or accounts", async () => {
    const reign = await new Player("king").takeover();
    const cap = (await one<{ max_anonymous_hails_per_ip_per_reign: number }>("select max_anonymous_hails_per_ip_per_reign from app_config"))
      .max_anonymous_hails_per_ip_per_reign;
    for (let i = 0; i < cap; i++) expect((await hail(reign.id, `d:${i}`, "shared")).status).toBe("created");
    expect(await hail(reign.id, "d:extra", "shared")).toEqual({ status: "ip_limit", hails: cap });
    // A device that already hailed hears "duplicate", not the limit.
    expect((await hail(reign.id, "d:0", "shared")).status).toBe("duplicate");
    // Another address is fine, and so is a signed-in player on the shared one.
    expect((await hail(reign.id, "d:other", "elsewhere")).status).toBe("created");
    const fan = new Player("fan");
    await fan.takeover();
    await new Player("newer").takeover();
    const current = await one<{ id: number }>("select current_reign_id as id from crown_state");
    const fanId = await fan.id();
    for (let i = 0; i < cap; i++) await hail(current.id, `d:n${i}`, "shared");
    expect((await hail(current.id, `p:${fanId}`, "shared", fanId)).status).toBe("created");
  });

  it("counts every hail when many arrive at once", async () => {
    const reign = await new Player("king").takeover();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => hail(reign.id, `d:${i}`, `ip-${i}`)));
    expect(results.filter((r) => r.status === "created")).toHaveLength(10);
    expect(await one("select hails from reign_hail_counts where reign_id = $1", [reign.id])).toEqual({ hails: 10 });
  });

  it("does the same device's repeats at once only once", async () => {
    const reign = await new Player("king").takeover();
    const results = await Promise.all(Array.from({ length: 5 }, () => hail(reign.id, "d:same", "ip-1")));
    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(await one("select hails from reign_hail_counts where reign_id = $1", [reign.id])).toEqual({ hails: 1 });
  });
});

describe("hail privacy", () => {
  it("shows clients the count only: no hailer, no address, no writes, no call", async () => {
    const reign = await new Player("king").takeover();
    await hail(reign.id, "d:one", "ip-1");
    for (const role of ["anon", "authenticated"] as const) {
      await asRole(role, async (db) => {
        const { rows } = await db.query("select * from reign_hail_counts");
        expect(rows).toEqual([{ reign_id: reign.id, hails: 1 }]);
        // A refused statement aborts the transaction, so each one runs behind a savepoint.
        for (const sql of [
          "select * from reign_hails",
          "update reign_hail_counts set hails = 99 where reign_id > 0",
          "insert into reign_hail_counts (reign_id, hails) values (1, 1)",
          "select hail_reign(1, 'x', 'y')",
        ]) {
          await db.query("savepoint attempt");
          await expect(db.query(sql), sql).rejects.toThrow(/permission denied/);
          await db.query("rollback to savepoint attempt");
        }
      });
    }
  });

  it("forgets the address of a hail after 90 days", async () => {
    const reign = await new Player("king").takeover();
    await hail(reign.id, "d:old", "ip-1");
    await hail(reign.id, "d:new", "ip-2");
    await q("update reign_hails set created_at = now() - interval '91 days' where hailer_key = 'd:old'");
    await svc("select purge_expired_records()");
    expect(await q("select hailer_key, ip_hash from reign_hails order by hailer_key")).toEqual([
      { hailer_key: "d:new", ip_hash: "ip-2" },
      { hailer_key: "d:old", ip_hash: null },
    ]);
  });
});
