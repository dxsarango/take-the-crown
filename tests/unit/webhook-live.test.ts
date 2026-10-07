import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({ data: "applied", error: null }));
let live = true;

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: () => ({ rpc }) }));
vi.mock("@/lib/home/cache", () => ({ revalidateHome: vi.fn() }));
vi.mock("@/lib/email/outbox", () => ({ processOutbox: vi.fn(async () => undefined) }));
vi.mock("@/lib/payments/refunds", () => ({ paymentIdFor: vi.fn(), requestRefund: vi.fn() }));
vi.mock("@/lib/config/deployment", () => ({ isDeployed: () => true }));
vi.mock("@/lib/payments", () => ({
  providerByName: async () => ({
    name: "dodo",
    live,
    verifyWebhook: async () => ({
      type: "payment_succeeded",
      eventId: "evt_1",
      providerPaymentId: "pay_1",
      lockId: "f9ce3ca9-1dc7-47ab-99c7-8343ebf5a4ed",
      amountCents: 500,
      currency: "USD",
      email: "admin@test.local",
    }),
  }),
}));

const { POST } = await import("@/app/api/webhooks/[provider]/route");
const deliver = () => POST(new Request("https://takethecrown.app/api/webhooks/dodo", { method: "POST", body: "{}" }), { params: Promise.resolve({ provider: "dodo" }) } as never);

describe("payment webhook", () => {
  beforeEach(() => rpc.mockClear());

  it("records a payment taken in live mode as live, so the launch keeps it", async () => {
    live = true;
    expect((await deliver()).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_paid_payment", expect.objectContaining({ p_provider: "dodo", p_provider_payment_id: "pay_1", p_live: true }));
  });

  it("records a test-mode payment as not live", async () => {
    live = false;
    await deliver();
    expect(rpc).toHaveBeenCalledWith("record_paid_payment", expect.objectContaining({ p_live: false }));
  });
});
