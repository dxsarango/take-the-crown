import { beforeEach, describe, expect, it, vi } from "vitest";

type WebhookEvent = { type: string; [key: string]: unknown };

const revalidateHome = vi.fn();
let event: WebhookEvent;
let result: string | null = null;
const rpc = vi.fn(async () => ({ data: result, error: null }));

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: () => ({ rpc }) }));
vi.mock("@/lib/home/cache", () => ({ revalidateHome: () => revalidateHome() }));
vi.mock("@/lib/email/outbox", () => ({ processOutbox: vi.fn(async () => undefined) }));
vi.mock("@/lib/payments/refunds", () => ({ paymentIdFor: vi.fn(async () => null), requestRefund: vi.fn() }));
vi.mock("@/lib/config/deployment", () => ({ isDeployed: () => true }));
vi.mock("@/lib/payments", () => ({ providerByName: async () => ({ name: "dodo", live: true, verifyWebhook: async () => event }) }));

const { POST } = await import("@/app/api/webhooks/[provider]/route");
const deliver = () =>
  POST(new Request("https://takethecrown.app/api/webhooks/dodo", { method: "POST", body: "{}" }), { params: Promise.resolve({ provider: "dodo" }) } as never);

const paid = { type: "payment_succeeded", eventId: "evt_1", providerPaymentId: "pay_1", lockId: "f9ce3ca9-1dc7-47ab-99c7-8343ebf5a4ed", amountCents: 500, currency: "USD", email: "a@test.local" };

describe("payment webhooks drop the cached public pages when the game changes", () => {
  beforeEach(() => revalidateHome.mockClear());

  it("on a takeover", async () => {
    [event, result] = [paid, "applied"];
    await deliver();
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it.each(["duplicate", "refund_pending"])("not for a payment that crowned nobody (%s)", async (outcome) => {
    [event, result] = [paid, outcome];
    await deliver();
    expect(revalidateHome).not.toHaveBeenCalled();
  });

  it("on a refund, which reverses a delivered crown", async () => {
    [event, result] = [{ type: "refund_succeeded", providerPaymentId: "pay_1" }, null];
    await deliver();
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it("on a chargeback that reverses a reign", async () => {
    [event, result] = [{ type: "dispute", providerPaymentId: "pay_1", status: "lost" }, "reversed"];
    await deliver();
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it("not on a dispute that changes no reign", async () => {
    [event, result] = [{ type: "dispute", providerPaymentId: "pay_1", status: "opened" }, "recorded"];
    await deliver();
    expect(revalidateHome).not.toHaveBeenCalled();
  });
});
