import { describe, expect, it } from "vitest";
import { Player, one, q, svc, withFreshGame } from "./helpers";

withFreshGame();

async function queue(kind = "season_started", count = 1): Promise<{ profileId: string; ids: number[] }> {
  const player = new Player("outbox");
  await player.takeover();
  const profileId = await player.id();
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const row = await one<{ id: number }>("insert into notifications (kind, profile_id) values ($1, $2) returning id", [kind, profileId]);
    ids.push(Number(row.id));
  }
  return { profileId, ids };
}

const claim = async (limit = 10) => (await svc<{ id: string; attempts: number }>("select * from claim_notifications($1)", [limit])).map((r) => Number(r.id));

describe("claim_notifications", () => {
  it("claims pending notifications oldest first, counting the attempt", async () => {
    const { ids } = await queue("season_started", 3);
    expect(await claim(2)).toEqual(ids.slice(0, 2));
    expect(await one("select attempts, claimed_until > now() as held from notifications where id = $1", [ids[0]])).toEqual({ attempts: 1, held: true });
  });

  it("never hands the same notification to two senders at once", async () => {
    const { ids } = await queue("season_started", 4);
    const [a, b] = await Promise.all([claim(3), claim(3)]);
    expect([...a, ...b].sort()).toEqual(ids.sort());
    expect(new Set([...a, ...b]).size).toBe(4);
    expect(await claim()).toEqual([]);
  });

  it("takes back a claim that expired, as after a crash", async () => {
    const { ids } = await queue();
    await claim();
    await q("update notifications set claimed_until = now() - interval '1 second'");
    expect(await claim()).toEqual(ids);
    expect(await one("select attempts from notifications where id = $1", [ids[0]])).toEqual({ attempts: 2 });
  });
});

describe("marking notifications", () => {
  it("does not send a notification again once sent", async () => {
    const { ids } = await queue();
    await claim();
    await svc("select mark_notification_sent($1)", [ids[0]]);
    expect(await one("select sent_at is not null as sent, claimed_until from notifications")).toEqual({ sent: true, claimed_until: null });
    await q("update notifications set claimed_until = null");
    expect(await claim()).toEqual([]);
  });

  it("retries a failure until max_email_attempts, then gives up", async () => {
    await q("update app_config set max_email_attempts = 3");
    const { ids } = await queue();
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(await claim()).toEqual(ids);
      await svc("select mark_notification_failed($1, 'Resend answered 503', false)", [ids[0]]);
    }
    expect(await one("select attempts, failed_at is not null as given_up, last_error from notifications")).toEqual({
      attempts: 3,
      given_up: true,
      last_error: "Resend answered 503",
    });
    expect(await claim()).toEqual([]);
  });

  it("gives up at once on a final failure", async () => {
    const { ids } = await queue();
    await claim();
    await svc("select mark_notification_failed($1, 'skipped: alert_off', true)", [ids[0]]);
    expect(await one("select attempts, failed_at is not null as given_up from notifications")).toEqual({ attempts: 1, given_up: true });
  });
});

describe("turn_off_alert", () => {
  it("turns off exactly the alert the link names", async () => {
    const { profileId } = await queue();
    await q(
      "update profile_private set alerts_dethroned = true, alerts_price_below_cents = 800, alerts_season_start = true where profile_id = $1",
      [profileId],
    );
    const settings = () =>
      one("select alerts_dethroned, alerts_price_below_cents, alerts_season_start from profile_private where profile_id = $1", [profileId]);

    await svc("select turn_off_alert($1, 'price_drop')", [profileId]);
    expect(await settings()).toEqual({ alerts_dethroned: true, alerts_price_below_cents: null, alerts_season_start: true });
    await svc("select turn_off_alert($1, 'season_started')", [profileId]);
    await svc("select turn_off_alert($1, 'dethroned')", [profileId]);
    expect(await settings()).toEqual({ alerts_dethroned: false, alerts_price_below_cents: null, alerts_season_start: false });
    await expect(svc("select turn_off_alert($1, 'admin')", [profileId])).rejects.toThrow(/unknown_alert/);
  });
});
