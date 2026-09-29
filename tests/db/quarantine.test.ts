import { describe, expect, it } from "vitest";
import { Player, asRole, createLock, currentReign, one, pay, q, svc, uniqueEmail, withFreshGame } from "./helpers";

withFreshGame();

/** A takeover whose lock was created while the moderator was down. */
async function quarantinedTakeover(message = "Launching today", link: string | null = "https://turno.app") {
  const lock = await createLock({ email: uniqueEmail("held"), message, link });
  await q("update price_locks set moderation_status = 'pending' where id = $1", [lock.id]);
  expect(await pay(lock)).toBe("applied");
  const reign = await currentReign();
  return reign!.id;
}

describe("quarantined takeovers", () => {
  it("keep the reign but hide its message and link until approved", async () => {
    const reignId = await quarantinedTakeover();
    expect(await one("select moderation_status from reigns where id = $1", [reignId])).toEqual({ moderation_status: "pending" });
    expect(await one("select message, link from public_reigns where id = $1", [reignId])).toEqual({ message: null, link: null });

    expect(await one<{ ok: boolean }>("select settle_reign_moderation($1, true, null) as ok", [reignId])).toEqual({ ok: true });
    expect(await one("select message, link from public_reigns where id = $1", [reignId])).toEqual({
      message: "Launching today",
      link: "https://turno.app",
    });
  });

  it("stay hidden when the delayed verdict rejects them", async () => {
    const reignId = await quarantinedTakeover("Send 1 BTC get 2 back");
    await svc("select settle_reign_moderation($1, false, 'scam')", [reignId]);
    expect(await one("select moderation_status, moderation_reason, moderation_attempts from reigns where id = $1", [reignId])).toEqual({
      moderation_status: "rejected",
      moderation_reason: "scam",
      moderation_attempts: 1,
    });
    expect(await one("select message from public_reigns where id = $1", [reignId])).toEqual({ message: null });
    // A settled reign is not settled again.
    expect(await one<{ ok: boolean }>("select settle_reign_moderation($1, true, null) as ok", [reignId])).toEqual({ ok: false });
  });

  it("count retries that still had no verdict", async () => {
    const reignId = await quarantinedTakeover();
    await svc("select note_moderation_attempt($1)", [reignId]);
    await svc("select note_moderation_attempt($1)", [reignId]);
    expect(await one("select moderation_attempts, moderation_status from reigns where id = $1", [reignId])).toEqual({
      moderation_attempts: 2,
      moderation_status: "pending",
    });
  });

  it("are approved from the start when moderation answered at lock time", async () => {
    const reign = await new Player("clear").takeover({ message: "Hello" });
    expect(await one("select moderation_status from reigns where id = $1", [reign.id])).toEqual({ moderation_status: "approved" });
  });
});

describe("rate limits", () => {
  it("allow up to the limit per window and then refuse", async () => {
    const take = async () => (await one<{ ok: boolean }>("select take_rate_limit('moderation:ip-1', 3, 3600) as ok")).ok;
    expect([await take(), await take(), await take(), await take()]).toEqual([true, true, true, false]);
    expect((await one<{ ok: boolean }>("select take_rate_limit('moderation:ip-2', 3, 3600) as ok")).ok).toBe(true);
  });

  it("forget hits older than the window", async () => {
    await q("insert into rate_limit_hits (key, hit_at) select 'old', now() - interval '2 hours' from generate_series(1, 5)");
    expect((await one<{ ok: boolean }>("select take_rate_limit('old', 3, 3600) as ok")).ok).toBe(true);
    expect(await one("select count(*)::int as n from rate_limit_hits where key = 'old'")).toEqual({ n: 1 });
  });

  it("are service-only", async () => {
    await expect(asRole("anon", (c) => c.query("select take_rate_limit('x', 1, 60)"))).rejects.toThrow(/permission denied/);
    await expect(asRole("anon", (c) => c.query("select * from rate_limit_hits"))).rejects.toThrow(/permission denied/);
  });
});

describe("report threshold", () => {
  it("alerts every admin once, at the third report, without hiding anything", async () => {
    const admin = new Player("admin");
    await admin.takeover();
    await q("update profile_private set is_admin = true where profile_id = $1", [await admin.id()]);
    const reign = await new Player("loud").takeover({ message: "Look at me" });

    for (const ip of ["a", "b"]) await svc("select report_reign($1, $2, 'spam')", [reign.id, ip]);
    expect(await q("select * from notifications where kind = 'reports_threshold'")).toEqual([]);
    await svc("select report_reign($1, 'c', 'scam')", [reign.id]);
    await svc("select report_reign($1, 'd', 'offensive')", [reign.id]);
    await svc("select report_reign($1, 'c', 'scam')", [reign.id]);

    const alerts = await q<{ profile_id: string; payload: Record<string, unknown> }>(
      "select profile_id, payload from notifications where kind = 'reports_threshold'",
    );
    expect(alerts).toEqual([{ profile_id: await admin.id(), payload: { reign_id: reign.id, reports: 3 } }]);
    expect(await one("select message from public_reigns where id = $1", [reign.id])).toEqual({ message: "Look at me" });
  });
});
