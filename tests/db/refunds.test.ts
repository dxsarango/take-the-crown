import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Player, asRole, createLock, one, pay, q, svc, withFreshGame } from "./helpers";

withFreshGame();

type Refund = {
  id: string;
  status: string;
  refund_attempts: number;
  refund_next_attempt_at: Date | null;
  refund_last_error: string | null;
  refund_requested_at: Date | null;
};

/** A payment the game must refund: it paid less than the locked price. */
async function owedRefund(): Promise<string> {
  const lock = await createLock();
  const providerPaymentId = `pay_${randomUUID()}`;
  expect(await pay(lock, { amountCents: lock.price_cents - 1, providerPaymentId })).toBe("refund_pending");
  return (await one<{ id: string }>("select id from payments where provider_payment_id = $1", [providerPaymentId])).id;
}
const refund = (id: string) =>
  one<Refund>("select id, status, refund_attempts, refund_next_attempt_at, refund_last_error, refund_requested_at from payments where id = $1", [id]);
const claim = async (paymentId?: string) =>
  (await svc<{ id: string }>("select id from claim_refunds(10, $1)", [paymentId ?? null])).map((r) => r.id);
const failed = (id: string, retry: boolean, error = "Dodo POST /refunds answered 409: INSUFFICIENT_WALLET_FUNDS") =>
  svc("select record_refund_failed($1, $2, $3)", [id, error, retry]);
const secondsUntil = (date: Date | null) => (date ? (date.getTime() - Date.now()) / 1000 : null);
const alert = async () => (await svc<{ n: number }>("select queue_stuck_refund_alert() as n"))[0].n;

describe("refund retries", () => {
  it("schedules the first attempt as soon as a payment needs a refund", async () => {
    const id = await owedRefund();
    const r = await refund(id);
    expect(r).toMatchObject({ status: "refund_pending", refund_attempts: 0, refund_last_error: null, refund_requested_at: null });
    expect(secondsUntil(r.refund_next_attempt_at)).toBeLessThanOrEqual(1);
  });

  it("backs off exponentially up to the configured maximum", async () => {
    await q("update app_config set refund_retry_base_seconds = 60, refund_retry_max_seconds = 300");
    const id = await owedRefund();
    const waits: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      await q("update payments set refund_next_attempt_at = now() - interval '1 second' where id = $1", [id]);
      expect(await claim()).toEqual([id]);
      // Not due again until the backoff runs out.
      expect(await claim()).toEqual([]);
      await failed(id, true);
      waits.push(Math.round(secondsUntil((await refund(id)).refund_next_attempt_at) ?? 0));
    }
    expect(waits).toEqual([60, 120, 240, 300, 300]);
    expect((await refund(id)).refund_attempts).toBe(5);
  });

  it("stops after a refusal retrying can't fix, until an admin retries by hand", async () => {
    const id = await owedRefund();
    expect(await claim()).toEqual([id]);
    await failed(id, false, "Dodo POST /refunds answered 404: payment not found");
    expect(await refund(id)).toMatchObject({ refund_next_attempt_at: null, refund_last_error: "Dodo POST /refunds answered 404: payment not found" });
    expect(await claim()).toEqual([]);
    expect(await claim(id)).toEqual([id]);
  });

  it("waits for the provider's webhook once the request is accepted", async () => {
    const id = await owedRefund();
    await claim();
    await svc("select record_refund_requested($1)", [id]);
    expect(await refund(id)).toMatchObject({ refund_next_attempt_at: null, refund_last_error: null });
    expect((await refund(id)).refund_requested_at).not.toBeNull();
    expect(await claim(id)).toEqual([]);

    const [{ provider_payment_id }] = await q<{ provider_payment_id: string }>("select provider_payment_id from payments where id = $1", [id]);
    await svc("select mark_payment_refunded('test', $1)", [provider_payment_id]);
    expect((await refund(id)).status).toBe("refunded");
  });

  it("schedules an admin's refund of an applied payment", async () => {
    const king = new Player("refunded_by_admin");
    await king.takeover();
    const [{ id }] = await q<{ id: string }>("select id from payments where status = 'applied'");
    const [admin] = await q<{ profile_id: string }>("select profile_id from profile_private limit 1");
    await svc("select request_manual_refund($1, $2)", [id, admin.profile_id]);
    expect(await claim()).toEqual([id]);
  });

  it("can't be run by clients", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(asRole(role, (c) => c.query("select claim_refunds(10, null)"))).rejects.toThrow(/permission denied/);
      await expect(asRole(role, (c) => c.query("select queue_stuck_refund_alert()"))).rejects.toThrow(/permission denied/);
    }
  });
});

describe("stuck refund alert", () => {
  async function anAdmin(): Promise<string> {
    const player = new Player("refund_admin");
    await player.takeover();
    const id = await player.id();
    await q("update profile_private set is_admin = true where profile_id = $1", [id]);
    return id;
  }
  const alerts = () => q<{ profile_id: string; payload: { count: number } }>("select profile_id, payload from notifications where kind = 'refunds_stuck'");

  it("emails every admin once per interval while a refund is stuck, and stops when none is", async () => {
    const adminId = await anAdmin();
    const id = await owedRefund();
    // Due but not refused yet: nothing is stuck.
    expect(await alert()).toBe(0);

    await claim();
    await failed(id, true);
    expect(await alert()).toBe(1);
    expect(await alerts()).toEqual([{ profile_id: adminId, payload: expect.objectContaining({ count: 1 }) }]);
    expect(await alert()).toBe(0);

    await q("update notifications set created_at = now() - interval '61 minutes' where kind = 'refunds_stuck'");
    expect(await alert()).toBe(1);

    await q("update notifications set created_at = now() - interval '2 hours' where kind = 'refunds_stuck'");
    await svc("select record_refund_requested($1)", [id]);
    expect(await alert()).toBe(0);
  });
});
