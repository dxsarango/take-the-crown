import { describe, expect, it } from "vitest";
import { Player, createLock, currentReign, one, q, svc, takeover, withFreshGame } from "./helpers";

withFreshGame();

async function admin(): Promise<{ player: Player; profileId: string }> {
  const player = new Player("admin");
  await player.takeover();
  const profileId = await player.id();
  await q("update profile_private set is_admin = true where profile_id = $1", [profileId]);
  return { player, profileId };
}

const prelaunch = (on: boolean) => q("update app_config set prelaunch = $1", [on]);

describe("prelaunch", () => {
  it("starts on in a new database", async () => {
    expect(await one("select column_default from information_schema.columns where table_name = 'app_config' and column_name = 'prelaunch'")).toEqual({
      column_default: "true",
    });
  });

  it("lets only admins lock the crown", async () => {
    const { player, profileId } = await admin();
    const guest = new Player("guest");
    await guest.takeover();
    const signedIn = await guest.id();
    await prelaunch(true);

    await expect(createLock()).rejects.toThrow(/prelaunch/);
    await expect(createLock({ email: guest.email, name: guest.name, profileId: signedIn })).rejects.toThrow(/prelaunch/);
    // The admin, who is not the king, can test the whole flow.
    expect((await currentReign())?.profile_id).toBe(signedIn);
    const reign = await takeover({ email: player.email, name: player.name, profileId });
    expect(reign.profile_id).toBe(profileId);
  });
});

describe("launch_game", () => {
  it("clears the prelaunch tests, starts season 0 at launch and opens the crown", async () => {
    const { profileId } = await admin();
    await new Player("tester").takeover();
    await q("insert into notifications (kind, profile_id) values ('season_started', $1)", [profileId]);
    await prelaunch(true);
    const before = await q<{ id: number; length: string }>("select id, (ends_at - starts_at)::text as length from seasons order by id");
    const launch = new Date(Date.now() + 3_600_000);

    await svc("select launch_game($1)", [launch.toISOString()]);

    for (const table of ["reigns", "payments", "price_locks", "events", "profile_achievements", "rank_ups", "notifications", "reports"]) {
      expect(await q(`select 1 from ${table}`), table).toEqual([]);
    }
    expect(await one("select prelaunch from app_config")).toEqual({ prelaunch: false });
    const crown = await one<{ season_id: number; current_reign_id: number | null; base_price_cents: number; base_set_at: Date }>(
      "select season_id, current_reign_id, base_price_cents, base_set_at from crown_state",
    );
    const floor = await one<{ floor_cents: number }>("select floor_cents from app_config");
    expect(crown).toMatchObject({ season_id: 0, current_reign_id: null, base_price_cents: floor.floor_cents });
    expect(crown.base_set_at.getTime()).toBe(launch.getTime());

    const seasons = await q<{ id: number; starts_at: Date; length: string; closed_at: Date | null; king_profile_id: string | null }>(
      "select id, starts_at, (ends_at - starts_at)::text as length, closed_at, king_profile_id from seasons order by id",
    );
    expect(seasons[0].starts_at.getTime()).toBe(launch.getTime());
    expect(seasons.map((s) => s.length)).toEqual(before.map((s) => s.length));
    expect(seasons.every((s) => s.closed_at === null && s.king_profile_id === null)).toBe(true);
    // Profiles and the admin's rights stay.
    expect(await one("select is_admin from profile_private where profile_id = $1", [profileId])).toEqual({ is_admin: true });
  });

  it("refuses outside prelaunch and for a start in the past", async () => {
    await expect(svc("select launch_game(now())")).rejects.toThrow(/not_prelaunch/);
    await prelaunch(true);
    await expect(svc("select launch_game(now() - interval '1 hour')")).rejects.toThrow(/starts_in_past/);
  });
});
