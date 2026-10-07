import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: () => null }));
vi.mock("@/lib/payments/index", () => ({ paymentProvider: async () => null }));

const { attemptRefunds } = await import("@/lib/payments/refunds");
const { RefundError } = await import("@/lib/payments/types");

type Call = [string, Record<string, unknown>];

function fakeDb() {
  const calls: Call[] = [];
  const db = { rpc: async (name: string, args: Record<string, unknown>) => (calls.push([name, args]), { data: null, error: null }) };
  return { calls, db: db as unknown as Parameters<typeof attemptRefunds>[0] };
}

function provider(refund: () => Promise<void>) {
  return { name: "dodo", live: true, createCheckout: vi.fn(), verifyWebhook: vi.fn(), refund: vi.fn(refund) };
}

const payment = { id: "11111111-1111-4111-8111-111111111111", provider: "dodo", provider_payment_id: "pay_1" };
const insufficient = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "fixtures", "dodo", "refund-insufficient-funds.json"), "utf8")) as {
  code: string;
  message: string;
};

describe("attemptRefunds", () => {
  it("records an accepted request", async () => {
    const { db, calls } = fakeDb();
    const p = provider(async () => undefined);
    expect(await attemptRefunds(db, p, [payment])).toEqual(["requested"]);
    expect(p.refund).toHaveBeenCalledWith("pay_1");
    expect(calls).toEqual([["record_refund_requested", { p_payment_id: payment.id }]]);
  });

  it("keeps retrying while Dodo's wallet is short", async () => {
    const { db, calls } = fakeDb();
    const p = provider(async () => {
      throw new RefundError(`Dodo POST /refunds answered 409: ${JSON.stringify(insufficient)}`, true, insufficient.code);
    });
    expect(await attemptRefunds(db, p, [payment])).toEqual(["retrying"]);
    expect(calls).toEqual([["record_refund_failed", { p_payment_id: payment.id, p_error: expect.stringContaining("INSUFFICIENT_WALLET_FUNDS"), p_retry: true }]]);
  });

  it("stops on a permanent refusal, and retries unknown errors", async () => {
    const { db, calls } = fakeDb();
    const permanent = provider(async () => {
      throw new RefundError("payment not found", false, "NOT_FOUND");
    });
    const unknown = provider(async () => {
      throw new Error("socket hang up");
    });
    expect(await attemptRefunds(db, permanent, [payment])).toEqual(["stopped"]);
    expect(await attemptRefunds(db, unknown, [payment])).toEqual(["retrying"]);
    expect(calls.map(([, args]) => args.p_retry)).toEqual([false, true]);
  });

  it("never asks another provider to refund a payment it didn't take", async () => {
    const { db, calls } = fakeDb();
    const p = provider(async () => undefined);
    expect(await attemptRefunds(db, p, [{ ...payment, provider: "test" }])).toEqual(["stopped"]);
    expect(p.refund).not.toHaveBeenCalled();
    expect(calls[0][1]).toMatchObject({ p_retry: false, p_error: expect.stringMatching(/paid through test/) });
  });
});
