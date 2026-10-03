import { describe, expect, it } from "vitest";
import {
  Player,
  ageCurrentReign,
  closeSeason,
  count,
  createLock,
  one,
  pay,
  q,
  svc,
  withFreshGame,
} from "./helpers";

withFreshGame();

async function endSeason(id: number): Promise<void> {
  await closeSeason(id, 60);
}

async function rollover(): Promise<void> {
  await svc("select rollover_season()");
}

describe("rollover_season", () => {
  it("does nothing while the season is open", async () => {
    const reign = await new Player("king").takeover();
    await rollover();
    const state = await one<{ season_id: number; current_reign_id: number }>("select * from crown_state");
    expect(state).toMatchObject({ season_id: 0, current_reign_id: reign.id });
  });

  it("closes the reign at the season end and resets the crown", async () => {
    const reign = await new Player("king").takeover();
    await endSeason(0);
    await rollover();

    const closed = await one<Record<string, unknown>>("select * from reigns where id = $1", [reign.id]);
    const season = await one<{ ends_at: Date }>("select ends_at from seasons where id = 0");
    expect(closed.end_reason).toBe("season_end");
    expect(closed.ended_at).toEqual(season.ends_at);
    expect(closed.dethroned_by).toBeNull();

    const state = await one<Record<string, unknown>>("select * from public_crown_state");
    expect(state).toMatchObject({ season_id: 1, current_reign_id: null, price_cents: 500, is_locked: false });
  });

  it("awards guardian tiers reached by the reign it closes", async () => {
    const king = new Player("king");
    await king.takeover();
    await ageCurrentReign(24 * 3600 + 30);
    await closeSeason(0);
    await rollover();
    const rows = await q<{ achievement_code: string; season_id: number }>(
      "select achievement_code, season_id from profile_achievements where profile_id = $1 and achievement_code like 'guardian%' order by 1",
      [await king.id()],
    );
    expect(rows).toEqual([
      { achievement_code: "guardian_1", season_id: 0 },
      { achievement_code: "guardian_2", season_id: 0 },
    ]);
  });

  it("stores the season king by total reign time, not by longest reign", async () => {
    const steady = new Player("steady");
    const spiky = new Player("spiky");

    await spiky.takeover();
    await ageCurrentReign(5 * 3600);
    await steady.takeover();
    await ageCurrentReign(3 * 3600);
    await spiky.takeover();
    await ageCurrentReign(60);
    await steady.takeover();
    await ageCurrentReign(3 * 3600);
    await endSeason(0);
    // Close the last reign at a time we control.
    await closeSeason(0);
    await rollover();

    const season = await one<{ king_profile_id: string; closed_at: Date | null }>("select * from seasons where id = 0");
    expect(season.king_profile_id).toBe(await steady.id());
    expect(season.closed_at).not.toBeNull();
  });

  it("leaves the season without a king when nobody reigned", async () => {
    await endSeason(0);
    await rollover();
    const season = await one<{ king_profile_id: string | null }>("select king_profile_id from seasons where id = 0");
    expect(season.king_profile_id).toBeNull();
  });

  it("expires the active lock and refunds its payment", async () => {
    await new Player("king").takeover();
    const lock = await createLock();
    await endSeason(0);
    await rollover();

    const row = await one<{ status: string }>("select status from price_locks where id = $1", [lock.id]);
    expect(row.status).toBe("expired");
    expect(await pay(lock)).toBe("refund_pending");
  });

  it("publishes season_ended and season_started events", async () => {
    const king = new Player("king");
    await king.takeover();
    await endSeason(0);
    await rollover();

    const events = await q<{ kind: string; season_id: number; profile_id: string | null; payload: { slug: string } }>(
      "select * from events where kind in ('season_ended', 'season_started') order by id",
    );
    expect(events).toMatchObject([
      { kind: "season_ended", season_id: 0, profile_id: await king.id(), payload: { slug: "genesis" } },
      { kind: "season_started", season_id: 1, payload: { slug: "frost" } },
    ]);
  });

  it("opens the next season for takeovers", async () => {
    await new Player("old").takeover();
    await endSeason(0);
    await rollover();
    const reign = await new Player("new").takeover();
    expect(reign.season_id).toBe(1);
    expect(reign.price_paid_cents).toBe(500);
  });

  it("keeps the crown closed until the next season starts", async () => {
    await endSeason(0);
    await q("update seasons set starts_at = now() + interval '1 hour' where id = 1");
    await rollover();
    const state = await one<{ season_id: number }>("select season_id from crown_state");
    expect(state.season_id).toBe(1);
    await expect(createLock()).rejects.toThrow("season_closed");
  });

  it("runs only once per season", async () => {
    await endSeason(0);
    await rollover();
    await rollover();
    const state = await one<{ season_id: number }>("select season_id from crown_state");
    expect(state.season_id).toBe(1);
    expect(await count("events", "kind = 'season_started'")).toBe(1);
  });

  describe("without a next season", () => {
    async function moveToLastSeason(): Promise<void> {
      await q("update seasons set starts_at = now() - interval '2 days' where id = 2");
      await q("update crown_state set season_id = 2");
    }

    it("raises no_next_season_configured and keeps the crown in the closed season", async () => {
      await moveToLastSeason();
      await new Player("king").takeover();
      await endSeason(2);

      await expect(rollover()).rejects.toThrow("no_next_season_configured");
      const state = await one<{ season_id: number; current_reign_id: number | null }>("select * from crown_state");
      expect(state.season_id).toBe(2);
      expect(state.current_reign_id).not.toBeNull();
    });

    it("refunds payments until the next season is added", async () => {
      await moveToLastSeason();
      const lock = await createLock();
      await endSeason(2);
      await expect(rollover()).rejects.toThrow("no_next_season_configured");

      expect(await pay(lock)).toBe("refund_pending");
      await expect(createLock()).rejects.toThrow("season_closed");

      await q(`
        insert into seasons (id, slug, name_en, name_es, skin, starts_at, ends_at)
        values (3, 'test-next', 'Next', 'Siguiente', 'genesis', now(), now() + interval '30 days')
      `);
      await rollover();
      const state = await one<{ season_id: number }>("select season_id from crown_state");
      expect(state.season_id).toBe(3);
      await expect(createLock()).resolves.toMatchObject({ season_id: 3 });
    });
  });
});
