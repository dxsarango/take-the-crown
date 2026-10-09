import { describe, expect, it } from "vitest";
import {
  Player,
  createLock,
  expireLock,
  pay,
  one,
  q,
  svc,
  takeover,
  uniqueEmail,
  withFreshGame,
} from "./helpers";

withFreshGame();

describe("create_price_lock", () => {
  it("freezes the current price and marks the crown as locked", async () => {
    const lock = await createLock();
    const state = await one<{ is_locked: boolean; price_cents: number }>("select * from public_crown_state");

    expect(lock.status).toBe("active");
    expect(lock.price_cents).toBe(500);
    expect(lock.expected_reign_id).toBeNull();
    expect(state.is_locked).toBe(true);
    const seconds = (lock.expires_at.getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(290);
    expect(seconds).toBeLessThanOrEqual(301);
  });

  it("rejects a second lock while one is active", async () => {
    await createLock();
    await expect(createLock()).rejects.toThrow("crown_locked");
  });

  it("replaces an expired lock and marks it expired", async () => {
    const first = await createLock();
    await expireLock(first.id);
    const second = await createLock();

    const statuses = await q<{ id: string; status: string }>("select id, status from price_locks");
    expect(statuses.find((row) => row.id === first.id)?.status).toBe("expired");
    expect(statuses.find((row) => row.id === second.id)?.status).toBe("active");
  });

  it("allows a new lock after the holder releases it", async () => {
    const first = await createLock();
    await svc("select release_price_lock($1)", [first.id]);
    const state = await one<{ is_locked: boolean }>("select is_locked from public_crown_state");
    expect(state.is_locked).toBe(false);
    await expect(createLock()).resolves.toMatchObject({ status: "active" });
  });

  it("does not release someone else's active lock", async () => {
    const first = await createLock();
    await svc("select release_price_lock($1)", ["00000000-0000-0000-0000-000000000000"]);
    const state = await one<{ active_lock_id: string }>("select active_lock_id from crown_state");
    expect(state.active_lock_id).toBe(first.id);
  });

  it("stores the checkout id", async () => {
    const lock = await createLock();
    await svc("select set_lock_checkout($1, $2)", [lock.id, "chk_123"]);
    const row = await one<{ checkout_id: string }>("select checkout_id from price_locks where id = $1", [lock.id]);
    expect(row.checkout_id).toBe("chk_123");
  });

  it("locks the price of the current reign", async () => {
    await takeover();
    const lock = await createLock();
    const state = await one<{ current_reign_id: number }>("select current_reign_id from crown_state");
    expect(lock.expected_reign_id).toBe(state.current_reign_id);
    expect(lock.price_cents).toBe(600);
  });

  it("rate limits locks per IP per hour", async () => {
    const ip = "ip-rate-limit";
    for (let i = 0; i < 5; i++) {
      const lock = await createLock({ ip });
      await svc("select release_price_lock($1)", [lock.id]);
    }
    await expect(createLock({ ip })).rejects.toThrow("rate_limited");
    await expect(createLock({ ip: "ip-other" })).resolves.toMatchObject({ status: "active" });
  });

  it("forgets locks older than an hour for the rate limit", async () => {
    const ip = "ip-old-locks";
    for (let i = 0; i < 5; i++) {
      const lock = await createLock({ ip });
      await svc("select release_price_lock($1)", [lock.id]);
    }
    await q("update price_locks set created_at = now() - interval '61 minutes' where ip_hash = $1", [ip]);
    await expect(createLock({ ip })).resolves.toMatchObject({ status: "active" });
  });

  it("rejects messages over the configured length", async () => {
    await expect(createLock({ message: "x".repeat(81) })).rejects.toThrow("message_too_long");
    await expect(createLock({ message: "x".repeat(80) })).resolves.toMatchObject({ status: "active" });
  });

  it("uses the configured message length", async () => {
    await q("update app_config set max_message_length = 10");
    await expect(createLock({ message: "x".repeat(11) })).rejects.toThrow("message_too_long");
  });

  it("asks a guest using the king's email to verify it first", async () => {
    const king = new Player("king");
    await king.takeover();
    await expect(createLock({ email: king.email.toUpperCase() })).rejects.toThrow("email_verification_required");
  });

  it("rejects the current king by profile id", async () => {
    const king = new Player("king");
    await king.takeover();
    await expect(createLock({ email: uniqueEmail(), profileId: await king.id() })).rejects.toThrow("already_king");
  });

  it("rejects banned players", async () => {
    const player = new Player("banned");
    await player.takeover();
    await takeover();
    await q("update profiles set is_banned = true where id = $1", [await player.id()]);
    await expect(createLock({ email: player.email, profileId: await player.id() })).rejects.toThrow("banned");
  });

  it("rejects locks before the season starts", async () => {
    await q("update seasons set starts_at = now() + interval '1 hour' where id = 0");
    await expect(createLock()).rejects.toThrow("season_closed");
  });

  it("rejects locks after the season ends", async () => {
    await q("update seasons set ends_at = now() - interval '1 second' where id = 0");
    await expect(createLock()).rejects.toThrow("season_closed");
  });

});

// A rejected, declined or cancelled payment frees the crown through release_price_lock, called
// by POST /api/locks/[id]/release. These pin what that guarantees without any waiting: the
// database changes in the call itself, so the answer to the request is the moment others can buy.
describe("release_price_lock", () => {
  it("frees the crown in the call itself, and again is harmless", async () => {
    const lock = await createLock();
    expect((await one<{ is_locked: boolean }>("select is_locked from public_crown_state")).is_locked).toBe(true);

    await svc("select release_price_lock($1)", [lock.id]);
    expect(await one("select active_lock_id, active_lock_expires_at from crown_state")).toEqual({ active_lock_id: null, active_lock_expires_at: null });
    expect((await one<{ status: string }>("select status from price_locks where id = $1", [lock.id])).status).toBe("expired");
    await expect(createLock()).resolves.toMatchObject({ status: "active" });

    // A second release of the old lock must not free the new holder's lock.
    const holder = await one<{ active_lock_id: string }>("select active_lock_id from crown_state");
    await svc("select release_price_lock($1)", [lock.id]);
    expect((await one<{ active_lock_id: string }>("select active_lock_id from crown_state")).active_lock_id).toBe(holder.active_lock_id);
  });

  it("does not undo a payment that already crowned the buyer", async () => {
    const lock = await createLock();
    expect(await pay(lock)).toBe("applied");
    const before = await one("select current_reign_id, active_lock_id from crown_state");
    await svc("select release_price_lock($1)", [lock.id]);
    expect(await one("select current_reign_id, active_lock_id from crown_state")).toEqual(before);
    expect((await one<{ status: string }>("select status from price_locks where id = $1", [lock.id])).status).not.toBe("expired");
  });

  it("leaves the crown consistent whichever of a payment and a release lands first", async () => {
    for (let round = 0; round < 8; round++) {
      const lock = await createLock();
      const [result] = await Promise.all([pay(lock), svc("select release_price_lock($1)", [lock.id])]);
      const state = await one<{ active_lock_id: string | null }>("select active_lock_id from crown_state");
      expect(state.active_lock_id).toBeNull();
      // Either the buyer was crowned, or the payment came after the release and is refunded: never both.
      const reigns = await q("select 1 from reigns where payment_id = (select id from payments where lock_id = $1)", [lock.id]);
      expect(reigns).toHaveLength(result === "applied" ? 1 : 0);
      expect(["applied", "refund_pending"]).toContain(result);
      expect((await q("select 1 from reigns where ended_at is null")).length).toBeLessThanOrEqual(1);
    }
  });
});
