import { describe, expect, it } from "vitest";
import { Player, ageCurrentReign, asRole, one, q, svc, withFreshGame } from "./helpers";

withFreshGame();

async function rankEvents(profileId: string): Promise<string[]> {
  const rows = await q<{ rank: string }>(
    "select payload->>'rank' as rank from events where kind = 'rank_up' and profile_id = $1 order by id",
    [profileId],
  );
  return rows.map((r) => r.rank);
}

async function liveCheck(): Promise<void> {
  await svc("select check_live_achievements()");
}

describe("rank-ups", () => {
  it("publishes a rank when a dethronement pushes the total past it", async () => {
    const ana = new Player("ana");
    await ana.takeover();
    await ageCurrentReign(3601);
    expect(await rankEvents(await ana.id())).toEqual([]);

    await new Player("ben").takeover();
    expect(await rankEvents(await ana.id())).toEqual(["knight"]);
  });

  it("publishes every rank skipped in one long reign, in order", async () => {
    const ana = new Player("ana");
    await ana.takeover();
    await ageCurrentReign(25 * 3600);
    await new Player("ben").takeover();
    expect(await rankEvents(await ana.id())).toEqual(["knight", "baron", "count"]);
  });

  it("reaches a rank during a reign through the per-minute check, once", async () => {
    const ana = new Player("ana");
    await ana.takeover();
    await ageCurrentReign(3700);
    await liveCheck();
    await liveCheck();
    await liveCheck();
    expect(await rankEvents(await ana.id())).toEqual(["knight"]);

    // Losing the crown later does not publish it again.
    await new Player("ben").takeover();
    expect(await rankEvents(await ana.id())).toEqual(["knight"]);
    expect(await one("select count(*)::int as n from rank_ups where profile_id = $1", [await ana.id()])).toEqual({ n: 1 });
  });

  it("stays quiet below an hour", async () => {
    const ana = new Player("ana");
    await ana.takeover();
    await ageCurrentReign(3500);
    await liveCheck();
    await new Player("ben").takeover();
    expect(await rankEvents(await ana.id())).toEqual([]);
  });

  it("is readable by clients and written only by the database", async () => {
    const ana = new Player("ana");
    await ana.takeover();
    await ageCurrentReign(3700);
    await liveCheck();
    const rows = await asRole("anon", (c) => c.query("select rank from rank_ups"));
    expect(rows.rows).toEqual([{ rank: "knight" }]);
    await expect(
      asRole("authenticated", (c) => c.query("insert into rank_ups (profile_id, rank) values (gen_random_uuid(), 'duke')")),
    ).rejects.toThrow(/permission denied/);
    await expect(asRole("anon", (c) => c.query("select record_rank_ups(gen_random_uuid())"))).rejects.toThrow(/permission denied/);
  });
});

describe("records", () => {
  it("counts a season in numbers", async () => {
    const ana = new Player("ana", "EC");
    const ben = new Player("ben", "MX");
    await ana.takeover();
    await ageCurrentReign(600);
    await ben.takeover();
    await ageCurrentReign(60);
    await ana.takeover();

    const stats = await one("select reigns, kings, countries, shortest_seconds, peak_price_cents > 500 as grew from season_stats where season_id = 0");
    expect(stats).toEqual({ reigns: 3, kings: 2, countries: 2, shortest_seconds: 60, grew: true });
  });

  it("counts the players who reigned for each country", async () => {
    await new Player("ana", "EC").takeover();
    await new Player("ben", "EC").takeover();
    await new Player("cy", "MX").takeover();
    const rows = await q("select country_code, crowns, kings from country_leaderboard where season_id = 0 order by country_code");
    expect(rows).toEqual([
      { country_code: "EC", crowns: 2, kings: 2 },
      { country_code: "MX", crowns: 1, kings: 1 },
    ]);
  });
});
