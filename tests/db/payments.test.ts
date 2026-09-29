import { describe, expect, it } from "vitest";
import {
  Player,
  count,
  createLock,
  currentReign,
  expireLock,
  one,
  pay,
  paymentStatus,
  q,
  svc,
  takeover,
  withFreshGame,
} from "./helpers";

withFreshGame();

describe("record_paid_payment", () => {
  it("crowns the buyer, consumes the lock and raises the price 20%", async () => {
    const lock = await createLock({ name: "Ana", country: "MX", message: "hola", link: "https://ana.dev", localHour: 9 });
    expect(await pay(lock, { providerPaymentId: "pay_1" })).toBe("applied");

    const reign = await one<Record<string, unknown>>("select * from reigns");
    expect(reign).toMatchObject({
      price_paid_cents: 500,
      display_name: "Ana",
      country_code: "MX",
      message: "hola",
      link: "https://ana.dev",
      local_hour: 9,
      ended_at: null,
    });
    const state = await one<Record<string, unknown>>("select * from crown_state");
    expect(state).toMatchObject({ current_reign_id: reign.id, base_price_cents: 600, active_lock_id: null });
    expect(await paymentStatus("pay_1")).toBe("applied");
    const lockRow = await one<{ status: string }>("select status from price_locks where id = $1", [lock.id]);
    expect(lockRow.status).toBe("consumed");
  });

  it("rounds the next base price up", async () => {
    await q("update crown_state set base_price_cents = 777");
    const lock = await createLock();
    await pay(lock);
    const state = await one<{ base_price_cents: number }>("select base_price_cents from crown_state");
    expect(state.base_price_cents).toBe(Math.ceil(777 * 1.2));
  });

  it("uses the configured step", async () => {
    await q("update app_config set step_bps = 5000");
    await pay(await createLock());
    const state = await one<{ base_price_cents: number }>("select base_price_cents from crown_state");
    expect(state.base_price_cents).toBe(750);
  });

  it("dethrones the previous king", async () => {
    const first = new Player("first");
    const firstReign = await first.takeover();
    const second = new Player("second");
    const secondReign = await second.takeover();

    const ended = await one<Record<string, unknown>>("select * from reigns where id = $1", [firstReign.id]);
    expect(ended).toMatchObject({ end_reason: "dethroned", dethroned_by: await second.id() });
    expect(ended.ended_at).not.toBeNull();
    expect((await currentReign())?.id).toBe(secondReign.id);
    expect(await count("reigns", "ended_at is null")).toBe(1);
  });

  it("publishes a crown_taken event", async () => {
    const first = await takeover();
    const second = await takeover();
    const event = await one<{ kind: string; reign_id: number; payload: Record<string, unknown> }>(
      "select * from events where kind = 'crown_taken' and reign_id = $1",
      [second.id],
    );
    expect(event.payload).toMatchObject({ price_cents: 600, previous_profile_id: first.profile_id });
  });

  describe("idempotency", () => {
    it("ignores a repeated event id", async () => {
      const lock = await createLock();
      expect(await pay(lock, { eventId: "evt_same", providerPaymentId: "pay_a" })).toBe("applied");
      expect(await pay(lock, { eventId: "evt_same", providerPaymentId: "pay_b" })).toBe("duplicate");
      expect(await count("payments")).toBe(1);
      expect(await count("reigns")).toBe(1);
    });

    it("ignores a repeated provider payment id under a new event id", async () => {
      const lock = await createLock();
      expect(await pay(lock, { eventId: "evt_1", providerPaymentId: "pay_same" })).toBe("applied");
      expect(await pay(lock, { eventId: "evt_2", providerPaymentId: "pay_same" })).toBe("duplicate");
      expect(await count("payments")).toBe(1);
      expect(await count("reigns")).toBe(1);
    });

    it("treats the same payment id from another provider as a new payment", async () => {
      const lock = await createLock();
      expect(await pay(lock, { provider: "test", providerPaymentId: "pay_x" })).toBe("applied");
      expect(await pay(lock, { provider: "other", providerPaymentId: "pay_x" })).toBe("refund_pending");
    });

    it("refunds a second payment for an already consumed lock", async () => {
      const lock = await createLock();
      expect(await pay(lock)).toBe("applied");
      expect(await pay(lock, { providerPaymentId: "pay_second" })).toBe("refund_pending");
      expect(await count("reigns")).toBe(1);
    });

    it("returns the stored status when apply_payment runs again", async () => {
      const lock = await createLock();
      await pay(lock, { providerPaymentId: "pay_again" });
      const payment = await one<{ id: string }>("select id from payments where provider_payment_id = 'pay_again'");
      const rows = await svc<{ result: string }>("select apply_payment($1) as result", [payment.id]);
      expect(rows[0].result).toBe("applied");
      expect(await count("reigns")).toBe(1);
    });
  });

  describe("late payments", () => {
    it("applies a payment that arrives after expiry but inside the grace window", async () => {
      const lock = await createLock();
      await expireLock(lock.id, 590);
      expect(await pay(lock)).toBe("applied");
    });

    it("applies a late payment even after the lock was released", async () => {
      const lock = await createLock();
      await svc("select release_price_lock($1)", [lock.id]);
      expect(await pay(lock)).toBe("applied");
    });

    it("refunds a payment that arrives after the grace window", async () => {
      const lock = await createLock();
      await expireLock(lock.id, 610);
      expect(await pay(lock, { providerPaymentId: "pay_late" })).toBe("refund_pending");
      expect(await paymentStatus("pay_late")).toBe("refund_pending");
      expect(await count("reigns")).toBe(0);
    });

    it("uses the configured grace window", async () => {
      await q("update app_config set late_payment_grace_seconds = 60");
      const lock = await createLock();
      await expireLock(lock.id, 90);
      expect(await pay(lock)).toBe("refund_pending");
    });

    it("refunds a late payment when someone else holds an active lock", async () => {
      const late = await createLock();
      await expireLock(late.id, 30);
      const active = await createLock();
      expect(await pay(late)).toBe("refund_pending");
      const state = await one<{ active_lock_id: string }>("select active_lock_id from crown_state");
      expect(state.active_lock_id).toBe(active.id);
      expect(await pay(active)).toBe("applied");
    });

    it("refunds a late payment when the crown changed hands in the meantime", async () => {
      const late = await createLock();
      await expireLock(late.id, 30);
      await takeover();
      expect(await pay(late)).toBe("refund_pending");
      expect(await count("reigns")).toBe(1);
    });
  });

  describe("invalid payments", () => {
    it("refunds an underpayment", async () => {
      const lock = await createLock();
      expect(await pay(lock, { amountCents: lock.price_cents - 1 })).toBe("refund_pending");
    });

    it("accepts an overpayment and records the locked price", async () => {
      const lock = await createLock();
      expect(await pay(lock, { amountCents: lock.price_cents + 100 })).toBe("applied");
      const reign = await one<{ price_paid_cents: number }>("select price_paid_cents from reigns");
      expect(reign.price_paid_cents).toBe(lock.price_cents);
    });

    it("refunds a payment in another currency", async () => {
      const lock = await createLock();
      expect(await pay(lock, { currency: "EUR" })).toBe("refund_pending");
    });

    it("accepts the currency in lower case", async () => {
      const lock = await createLock();
      expect(await pay(lock, { currency: "usd" })).toBe("applied");
    });

    it("refunds a payment after the season closed", async () => {
      const lock = await createLock();
      await q("update seasons set ends_at = now() - interval '1 second' where id = 0");
      expect(await pay(lock)).toBe("refund_pending");
    });

    it("refunds a payment for a season that has not started", async () => {
      const lock = await createLock();
      await q("update seasons set starts_at = now() + interval '1 hour' where id = 0");
      expect(await pay(lock)).toBe("refund_pending");
    });

    it("releases the crown when refunding the active lock", async () => {
      const lock = await createLock();
      await pay(lock, { amountCents: 1 });
      const state = await one<{ is_locked: boolean }>("select is_locked from public_crown_state");
      expect(state.is_locked).toBe(false);
    });

    it("marks a refunded payment", async () => {
      const lock = await createLock();
      await pay(lock, { providerPaymentId: "pay_refund", amountCents: 1 });
      await svc("select mark_payment_refunded('test', 'pay_refund')");
      expect(await paymentStatus("pay_refund")).toBe("refunded");
    });
  });

  describe("self-takeover", () => {
    it("refunds the current king if a payment of theirs gets through", async () => {
      const king = new Player("king");
      await king.takeover();
      // A lock bought for the king by email before the check could run: forge one.
      const lock = await createLock();
      await q("update price_locks set email = $2 where id = $1", [lock.id, king.email]);
      expect(await pay({ ...lock, email: king.email })).toBe("refund_pending");
      expect(await count("reigns")).toBe(1);
    });

    it("refunds the current king identified by profile id", async () => {
      const king = new Player("king");
      await king.takeover();
      const lock = await createLock();
      await q("update price_locks set profile_id = $2 where id = $1", [lock.id, await king.id()]);
      expect(await pay(lock)).toBe("refund_pending");
    });
  });

  describe("dethroned notification", () => {
    it("queues an alert for the previous king", async () => {
      const first = new Player("first");
      const reign = await first.takeover();
      const second = new Player("second");
      await second.takeover();

      const notification = await one<{ kind: string; profile_id: string; payload: Record<string, unknown> }>(
        "select * from notifications",
      );
      expect(notification.kind).toBe("dethroned");
      expect(notification.profile_id).toBe(await first.id());
      expect(notification.payload).toMatchObject({ reign_id: reign.id, by_profile_id: await second.id() });
    });

    it("skips players who turned alerts off", async () => {
      const first = new Player("first");
      await first.takeover();
      await q("update profile_private set alerts_email = false where profile_id = $1", [await first.id()]);
      await new Player("second").takeover();
      expect(await count("notifications")).toBe(0);
    });

    it("does not queue anything for the first reign", async () => {
      await takeover();
      expect(await count("notifications")).toBe(0);
    });
  });
});
