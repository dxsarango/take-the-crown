import { describe, expect, it } from "vitest";
import { Player, ageCurrentReign, asRole, count, createLock, one, pay, q, svc, withFreshGame } from "./helpers";

withFreshGame();

// Production sits in prelaunch with an admin's real purchase on the throne. Launching must leave
// the game as if nobody had ever played: the one thing that stays is the payment, for the books.

const DAY = 86_400;

async function admin(label: string): Promise<{ player: Player; profileId: string }> {
  const player = new Player(label);
  await player.takeover();
  const profileId = await player.id();
  await q("update profile_private set is_admin = true where profile_id = $1", [profileId]);
  return { player, profileId };
}

/** What production looks like before launch: a live reign, a dethroning, medals, ranks, noise. */
async function prelaunchGame() {
  const dario = await admin("dario");
  const other = await admin("other");
  await q("update app_config set prelaunch = true");

  const lockFor = (who: { player: Player; profileId: string }) => createLock({ email: who.player.email, name: who.player.name, profileId: who.profileId });
  const liveLock = await lockFor(dario);
  expect(await pay(liveLock, { provider: "dodo", providerPaymentId: "pay_live_dario", live: true })).toBe("applied");
  await ageCurrentReign(10 * DAY);
  // Someone takes it and loses it, so there is a dethroning, a rival and a longer total time.
  expect(await pay(await lockFor(other), { provider: "dodo", providerPaymentId: "pay_other" })).toBe("applied");
  expect(await pay(await lockFor(dario), { provider: "dodo", providerPaymentId: "pay_dario_again", live: true })).toBe("applied");

  await q("insert into rank_ups (profile_id, rank) values ($1, 'knight') on conflict do nothing", [dario.profileId]);
  await q("insert into notifications (kind, profile_id) values ('season_started', $1)", [dario.profileId]);
  await q("insert into rate_limit_hits (key) values ('magic_link:test')");
  return { dario, other, liveLock };
}

const publicRows = (sql: string) => asRole("anon", async (client) => (await client.query(sql)).rows);

describe("launch_game starts the game clean", () => {
  it("has a reign, medals and ranks to clear before launch", async () => {
    const { dario } = await prelaunchGame();
    expect(await count("reigns")).toBeGreaterThanOrEqual(3);
    expect(await count("profile_achievements", "profile_id = $1", [dario.profileId])).toBeGreaterThan(0);
    expect(await count("profile_achievements", "achievement_code = 'founder'")).toBeGreaterThan(0);
    expect(await count("events")).toBeGreaterThan(0);
    expect((await publicRows("select crowns_taken, total_reign_seconds from profile_stats"))).toContainEqual(
      expect.objectContaining({ crowns_taken: 2 }),
    );
  });

  it("leaves no reign, medal, rank, event or ranking behind, and the crown at the base price", async () => {
    await prelaunchGame();
    const launch = new Date(Date.now() - 30_000);
    await svc("select launch_game($1)", [launch.toISOString()]);

    for (const table of ["reigns", "profile_achievements", "rank_ups", "events", "notifications", "reports", "webhook_events", "rate_limit_hits"]) {
      expect(await count(table), table).toBe(0);
    }
    // What clients read.
    for (const view of ["public_reigns", "public_chronicle", "public_rivalries", "season_leaderboard", "country_leaderboard"]) {
      expect(await publicRows(`select 1 from ${view}`), view).toEqual([]);
    }
    expect((await publicRows("select reigns, kings, countries, longest_seconds, peak_price_cents from season_stats")).every((s) => s.reigns === 0 && s.kings === 0 && s.countries === 0 && s.longest_seconds === null && s.peak_price_cents === null)).toBe(true);
    expect((await publicRows("select holders from achievement_stats")).every((a) => a.holders === 0)).toBe(true);

    // Every profile reads as a newcomer; nobody has a crown, a time or a rank.
    const stats = await publicRows("select crowns_taken, total_reign_seconds, longest_reign_seconds, times_dethroned, total_spent_cents, rank from profile_stats");
    expect(stats.length).toBeGreaterThan(0);
    for (const s of stats) {
      expect(s).toMatchObject({ crowns_taken: 0, total_reign_seconds: 0, longest_reign_seconds: 0, times_dethroned: 0, rank: "peasant" });
      expect(Number(s.total_spent_cents ?? 0)).toBe(0);
    }

    // The throne is empty and opens at the base price, unlocked, in season 0.
    const floor = (await one<{ floor_cents: number }>("select floor_cents from app_config")).floor_cents;
    const crown = await publicRows("select season_id, current_reign_id, base_price_cents, price_cents, is_locked from public_crown_state");
    expect(crown).toEqual([{ season_id: 0, current_reign_id: null, base_price_cents: floor, price_cents: floor, is_locked: false }]);
    expect(await one("select active_lock_id, active_lock_expires_at from crown_state")).toEqual({ active_lock_id: null, active_lock_expires_at: null });
    expect(await one("select closed_at, king_profile_id from seasons where id = 0")).toEqual({ closed_at: null, king_profile_id: null });
    expect(await one("select starts_at from seasons where id = 0")).toEqual({ starts_at: launch });
  });

  it("lists no player to index: nobody has a reign that counts", async () => {
    await prelaunchGame();
    await svc("select launch_game($1)", [new Date(Date.now() - 30_000).toISOString()]);
    // The sitemap and the profile pages index players who have a reign that was not reversed.
    expect(await q("select p.id from profiles p where exists (select 1 from public_reigns r where r.profile_id = p.id and not r.reversed)")).toEqual([]);
  });

  it("keeps only the payment, for the books, with no reign pointing at it", async () => {
    const { liveLock } = await prelaunchGame();
    await svc("select launch_game($1)", [new Date(Date.now() - 30_000).toISOString()]);
    const kept = await q<{ provider_payment_id: string; live: boolean; status: string; lock_id: string }>(
      "select provider_payment_id, live, status, lock_id from payments order by provider_payment_id",
    );
    expect(kept.map((p) => p.provider_payment_id)).toEqual(["pay_dario_again", "pay_live_dario"]);
    expect(kept.every((p) => p.live && p.status === "applied")).toBe(true);
    expect(kept.map((p) => p.lock_id)).toContain(liveLock.id);
    expect(await count("price_locks")).toBe(2);
  });

  it("makes the first real player the first king: Founder and First blood again, from the base price", async () => {
    const { dario } = await prelaunchGame();
    await svc("select launch_game($1)", [new Date(Date.now() - 30_000).toISOString()]);

    // A player who held the crown in prelaunch buys again as if for the first time.
    const reign = await dario.player.takeover();
    const floor = (await one<{ floor_cents: number }>("select floor_cents from app_config")).floor_cents;
    expect(reign.price_paid_cents).toBe(floor);
    const medals = await q<{ achievement_code: string }>("select achievement_code from profile_achievements order by achievement_code");
    expect(medals.map((m) => m.achievement_code)).toEqual(expect.arrayContaining(["founder", "first_blood"]));
    expect(await count("profile_achievements", "achievement_code = 'founder'")).toBe(1);
    expect(await count("reigns")).toBe(1);
    expect(await count("rank_ups")).toBe(0);
    expect(await one("select crowns_taken, rank from profile_stats where profile_id = $1", [dario.profileId])).toEqual({ crowns_taken: 1, rank: "peasant" });
  });
});
