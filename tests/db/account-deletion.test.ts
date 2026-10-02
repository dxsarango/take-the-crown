import { describe, expect, it } from "vitest";
import { Player, createLock, currentReign, one, pay, q, svc, takeover, uniqueEmail, withFreshGame } from "./helpers";

withFreshGame();

const deleteProfile = async (profileId: string) =>
  (await svc<{ user_id: string | null }>("select delete_profile($1) as user_id", [profileId]))[0].user_id;

describe("delete_profile", () => {
  it("anonymizes the profile and its reigns and deletes the private data", async () => {
    const king = new Player("leaving");
    const first = await king.takeover({ message: "hello there", link: "https://leaving.example" });
    const profileId = await king.id();
    await q("update profiles set main_link = 'https://leaving.example', link_x = 'https://x.com/leaving', showcase = '{founder}' where id = $1", [profileId]);
    await q("insert into profile_name_history (name, profile_id) values ('old_leaving_name', $1)", [profileId]);
    await q("insert into notifications (kind, profile_id) values ('season_started', $1)", [profileId]);
    await new Player("next").takeover();

    await deleteProfile(profileId);

    const profile = await one<Record<string, unknown>>("select * from profiles where id = $1", [profileId]);
    expect(profile.name).toMatch(/^former~[0-9a-f]{12}$/);
    expect(profile).toMatchObject({
      user_id: null,
      country_code: null,
      main_link: null,
      link_x: null,
      avatar_mode: "generated",
      avatar_path: null,
      avatar_seed: "0".repeat(32),
      showcase: [],
    });
    expect(profile.deleted_at).not.toBeNull();

    const reign = await one("select name, message, link, country_code, price_paid_cents from reigns where id = $1", [first.id]);
    expect(reign).toEqual({ name: profile.name, message: null, link: null, country_code: null, price_paid_cents: first.price_paid_cents });

    expect(await q("select 1 from profile_private where profile_id = $1", [profileId])).toEqual([]);
    expect(await q("select 1 from notifications where profile_id = $1", [profileId])).toEqual([]);
    // Former names are free again.
    expect((await one<{ ok: boolean }>("select is_profile_name_available('old_leaving_name') as ok")).ok).toBe(true);
    expect((await one<{ ok: boolean }>("select is_profile_name_available($1) as ok", [king.name])).ok).toBe(true);
    // Payment records stay for tax law, with the buyer's email.
    const payment = await one<{ email: string }>("select p.email from payments p join reigns r on r.payment_id = p.id where r.id = $1", [first.id]);
    expect(payment.email).toBe(king.email.toLowerCase());
  });

  it("keeps achievements and statistics with the anonymous profile", async () => {
    const king = new Player("stats");
    await king.takeover();
    const profileId = await king.id();
    await new Player("taker").takeover();
    const before = await one("select crowns_taken, total_reign_seconds from profile_stats where profile_id = $1", [profileId]);
    const achievements = await q("select achievement_code from profile_achievements where profile_id = $1 order by 1", [profileId]);

    await deleteProfile(profileId);

    expect(await one("select crowns_taken, total_reign_seconds from profile_stats where profile_id = $1", [profileId])).toEqual(before);
    expect(await q("select achievement_code from profile_achievements where profile_id = $1 order by 1", [profileId])).toEqual(achievements);
  });

  it("cancels a checkout in progress and refunds its late payment", async () => {
    const buyer = new Player("midpay");
    await buyer.takeover();
    await new Player("other").takeover();
    const profileId = await buyer.id();
    const lock = await createLock({ email: buyer.email, name: buyer.name, profileId });
    expect((await one("select active_lock_id from crown_state")).active_lock_id).toBe(lock.id);

    await deleteProfile(profileId);

    expect(await one("select active_lock_id from crown_state")).toEqual({ active_lock_id: null });
    expect(await one("select status from price_locks where id = $1", [lock.id])).toEqual({ status: "expired" });
    expect(await pay(lock)).toBe("refund_pending");
    expect((await currentReign())?.profile_id).not.toBe(profileId);
  });

  it("lets the same email start over with a new profile", async () => {
    const player = new Player("again");
    await player.takeover();
    const old = await player.id();
    await new Player("between").takeover();
    await deleteProfile(old);

    await takeover({ email: player.email, name: player.name });
    expect(await player.id()).not.toBe(old);
  });

  it("deletes a profile only once", async () => {
    const player = new Player("twice");
    await player.takeover();
    const profileId = await player.id();
    await new Player("after").takeover();
    await deleteProfile(profileId);
    await expect(deleteProfile(profileId)).rejects.toThrow(/profile_not_found/);
  });

  it("returns the sign-in user so the server can delete it", async () => {
    const player = new Player("signedin");
    await player.takeover();
    const profileId = await player.id();
    const userId = "6f1c1f2e-5b7a-4c1e-9d3a-1b2c3d4e5f60";
    await q("insert into auth.users (id, email) values ($1, $2)", [userId, uniqueEmail("auth")]);
    await q("update profiles set user_id = $2 where id = $1", [profileId, userId]);
    await new Player("x").takeover();
    expect(await deleteProfile(profileId)).toBe(userId);
    expect(await one("select user_id from profiles where id = $1", [profileId])).toEqual({ user_id: null });
  });

  it("keeps the silhouette's all-zero avatar seed for deleted profiles only", async () => {
    const player = new Player("seedy");
    await player.takeover();
    const profileId = await player.id();
    await expect(q("update profiles set avatar_seed = $2 where id = $1", [profileId, "0".repeat(32)])).rejects.toThrow(/profiles_avatar_seed_reserved/);
    await expect(createLock({ avatarSeed: "0".repeat(32) })).rejects.toThrow(/price_locks_avatar_seed_reserved/);
  });

  it("keeps the reserved name for deleted profiles only", async () => {
    const player = new Player("typist");
    await player.takeover();
    const profileId = await player.id();
    await expect(q("update profiles set name = 'former~0123456789ab' where id = $1", [profileId])).rejects.toThrow(/profiles_name_format/);
    expect((await one<{ ok: boolean }>("select is_profile_name_available('former~0123456789ab') as ok")).ok).toBe(false);
  });
});

describe("purge_expired_records", () => {
  it("drops IP hashes, limit hits and sent emails older than the policy allows", async () => {
    const player = new Player("old");
    const reign = await player.takeover();
    const profileId = await player.id();
    await q("update price_locks set created_at = now() - interval '91 days'");
    await q("insert into reports (reign_id, reporter_ip_hash, reason, created_at) values ($1, 'old-ip', 'spam', now() - interval '91 days'), ($1, 'new-ip', 'spam', now())", [reign.id]);
    await q("insert into rate_limit_hits (key, hit_at) values ('report:old', now() - interval '2 days'), ('report:new', now())");
    await q(
      `insert into notifications (kind, profile_id, sent_at, created_at) values
         ('season_started', $1, now() - interval '91 days', now() - interval '91 days'),
         ('season_started', $1, now(), now()),
         ('season_started', $1, null, now() - interval '91 days')`,
      [profileId],
    );

    await svc("select purge_expired_records()");

    expect(await q("select ip_hash from price_locks where ip_hash is not null")).toEqual([]);
    expect(await q("select reporter_ip_hash from reports order by reporter_ip_hash nulls first")).toEqual([
      { reporter_ip_hash: null },
      { reporter_ip_hash: "new-ip" },
    ]);
    expect(await q("select key from rate_limit_hits where key like 'report:%'")).toEqual([{ key: "report:new" }]);
    // A notification never sent is left for the sender to finish or give up.
    expect(await q("select sent_at is not null as sent from notifications where profile_id = $1 order by sent", [profileId])).toEqual([
      { sent: false },
      { sent: true },
    ]);
  });
});
