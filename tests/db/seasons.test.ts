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

  it("runs only once per season", async () => {
    await endSeason(0);
    await rollover();
    await rollover();
    const state = await one<{ season_id: number }>("select season_id from crown_state");
    expect(state.season_id).toBe(1);
    expect(await count("events", "kind = 'season_started'")).toBe(1);
  });

  describe("without a season starting when this one ends", () => {
    async function moveToLastSeason(): Promise<void> {
      await q("update seasons set starts_at = now() - interval '2 days' where id = 12");
      await q("update crown_state set season_id = 12");
    }

    async function makeAdmin(): Promise<string> {
      const admin = new Player("admin");
      await admin.takeover();
      const id = await admin.id();
      await q("update profile_private set is_admin = true where profile_id = $1", [id]);
      return id;
    }

    it("runs the season one more month, keeps the crown open and tells the admins", async () => {
      await moveToLastSeason();
      const adminId = await makeAdmin();
      const king = await new Player("king").takeover();
      await endSeason(12);
      const { ends_at: endedAt } = await one<{ ends_at: Date }>("select ends_at from seasons where id = 12");

      await rollover();

      const season = await one<{ ends_at: Date; closed_at: Date | null }>("select ends_at, closed_at from seasons where id = 12");
      expect(season.closed_at).toBeNull();
      const extended = new Date(endedAt);
      extended.setUTCMonth(extended.getUTCMonth() + 1);
      expect(season.ends_at.getTime()).toBe(extended.getTime());
      // The reign goes on and the crown can still be taken.
      expect(await one("select season_id, current_reign_id from crown_state")).toEqual({ season_id: 12, current_reign_id: king.id });
      await expect(new Player("taker").takeover()).resolves.toMatchObject({ season_id: 12 });

      const notices = await q<{ profile_id: string; payload: { season_id: number } }>(
        "select profile_id, payload from notifications where kind = 'season_extended'",
      );
      expect(notices).toEqual([{ profile_id: adminId, payload: { season_id: 12, ends_at: expect.any(String) } }]);
      // Once extended, nothing more happens until the new end.
      await rollover();
      expect(await count("notifications", "kind = 'season_extended'")).toBe(1);
    });

    it("extends when the next season leaves a gap, and moves on once one starts exactly at the end", async () => {
      await endSeason(0);
      await q("update seasons set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = 1");
      await rollover();
      expect(await one("select season_id from crown_state")).toEqual({ season_id: 0 });

      // The admin adds a season that starts exactly when the extended one ends; that end comes.
      await closeSeason(0, 60);
      await rollover();
      expect(await one("select season_id from crown_state")).toEqual({ season_id: 1 });
    });
  });
});
