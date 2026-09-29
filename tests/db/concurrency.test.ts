import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type Lock, count, createLock, pay, svc, takeover, withFreshGame } from "./helpers";

withFreshGame();

/** Creates `n` locks for the current reign, each released so the next one can be taken. */
async function releasedLocks(n: number): Promise<Lock[]> {
  const locks: Lock[] = [];
  for (let i = 0; i < n; i++) {
    const lock = await createLock();
    await svc("select release_price_lock($1)", [lock.id]);
    locks.push(lock);
  }
  return locks;
}

describe("parallel payments", () => {
  it("crowns exactly one buyer when payments for different locks race", async () => {
    for (let round = 0; round < 5; round++) {
      const reignsBefore = await count("reigns");
      const locks = await releasedLocks(8);

      const results = await Promise.all(locks.map((lock) => pay(lock)));

      expect(results.filter((result) => result === "applied")).toHaveLength(1);
      expect(results.filter((result) => result === "refund_pending")).toHaveLength(7);
      expect(await count("reigns")).toBe(reignsBefore + 1);
      expect(await count("reigns", "ended_at is null")).toBe(1);
      expect(await count("payments", "status = 'applied'")).toBe(round + 1);
    }
  });

  it("crowns exactly one buyer when the crown already has a king", async () => {
    await takeover();
    const locks = await releasedLocks(6);
    const active = await createLock();

    const results = await Promise.all([...locks, active].map((lock) => pay(lock)));

    expect(results.filter((result) => result === "applied")).toHaveLength(1);
    expect(await count("reigns")).toBe(2);
    expect(await count("reigns", "ended_at is null")).toBe(1);
  });

  it("applies a webhook delivered several times in parallel only once", async () => {
    const lock = await createLock();
    const eventId = `evt_${randomUUID()}`;
    const providerPaymentId = `pay_${randomUUID()}`;

    const results = await Promise.all(Array.from({ length: 6 }, () => pay(lock, { eventId, providerPaymentId })));

    expect(results.filter((result) => result === "applied")).toHaveLength(1);
    expect(results.filter((result) => result === "duplicate")).toHaveLength(5);
    expect(await count("payments")).toBe(1);
    expect(await count("reigns")).toBe(1);
  });
});
