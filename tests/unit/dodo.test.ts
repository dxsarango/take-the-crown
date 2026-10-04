import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let lockByCheckout: Record<string, string> = {};
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({
    from: () => {
      let checkout = "";
      const chain = {
        select: () => chain,
        eq: (_: string, value: string) => {
          checkout = value;
          return chain;
        },
        maybeSingle: async () => ({ data: lockByCheckout[checkout] ? { id: lockByCheckout[checkout] } : null, error: null }),
      };
      return chain;
    },
  }),
}));

const { signWebhook, verifyWebhookSignature } = await import("@/lib/payments/standard-webhooks");
const { DodoProvider, mapDodoEvent } = await import("@/lib/payments/dodo");

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "tests", "fixtures", "dodo", `${name}.json`), "utf8");
// A Standard Webhooks secret: whsec_ + base64 of the signing key.
const SECRET = `whsec_${Buffer.from("take-the-crown-test-signing-key-0123456789").toString("base64")}`;
const NOW = Date.parse("2026-10-04T12:00:00Z");
const LOCK = "6a0c1d2e-3f40-4b5c-8d6e-7f8091a2b3c4";

function signed(body: string, overrides: Partial<Record<"id" | "timestamp" | "signature", string>> = {}) {
  const id = overrides.id ?? "msg_2Xq8";
  const timestamp = overrides.timestamp ?? String(Math.floor(NOW / 1000));
  const signature = overrides.signature ?? `v1,${signWebhook(SECRET, id, Number(timestamp), body)}`;
  return { id, timestamp, signature };
}

describe("Standard Webhooks signatures", () => {
  const body = fixture("payment-succeeded");

  it("accepts the provider's signature over id, timestamp and the raw body", () => {
    expect(verifyWebhookSignature(SECRET, signed(body), body, NOW)).toBe(true);
  });

  it("accepts any matching v1 signature among several (secret rotation)", () => {
    const good = signed(body).signature;
    expect(verifyWebhookSignature(SECRET, signed(body, { signature: `v1,bm9wZQ== ${good}` }), body, NOW)).toBe(true);
  });

  it("refuses a changed body, another secret, another id and a bad header", () => {
    const headers = signed(body);
    expect(verifyWebhookSignature(SECRET, headers, body.replace("3400", "1"), NOW)).toBe(false);
    expect(verifyWebhookSignature(`whsec_${Buffer.from("another-key").toString("base64")}`, headers, body, NOW)).toBe(false);
    expect(verifyWebhookSignature(SECRET, { ...headers, id: "msg_other" }, body, NOW)).toBe(false);
    expect(verifyWebhookSignature(SECRET, { ...headers, signature: headers.signature.replace("v1,", "v2,") }, body, NOW)).toBe(false);
    expect(verifyWebhookSignature(SECRET, { ...headers, signature: null }, body, NOW)).toBe(false);
    expect(verifyWebhookSignature(SECRET, { ...headers, timestamp: "soon" }, body, NOW)).toBe(false);
  });

  it("refuses a replay older or newer than five minutes", () => {
    const old = signed(body, { timestamp: String(Math.floor(NOW / 1000) - 301) });
    expect(verifyWebhookSignature(SECRET, old, body, NOW)).toBe(false);
    const future = signed(body, { timestamp: String(Math.floor(NOW / 1000) + 301) });
    expect(verifyWebhookSignature(SECRET, future, body, NOW)).toBe(false);
  });
});

describe("Dodo payloads", () => {
  it("maps a successful payment to its lock, amount and buyer", () => {
    expect(mapDodoEvent(JSON.parse(fixture("payment-succeeded")))).toEqual({
      type: "payment_succeeded",
      providerPaymentId: "pay_test_7Hq2Lc",
      lockId: LOCK,
      checkoutId: "cks_test_Xa81",
      amountCents: 3400,
      currency: "USD",
      email: "nadia@example.com",
    });
  });

  it("maps a refund to its payment", () => {
    expect(mapDodoEvent(JSON.parse(fixture("refund-succeeded")))).toEqual({ type: "refund_succeeded", providerPaymentId: "pay_test_7Hq2Lc" });
  });

  it("ignores other events and refuses malformed ones", () => {
    expect(mapDodoEvent(JSON.parse(fixture("payment-failed")))).toEqual({ type: "ignored" });
    expect(mapDodoEvent({ type: "payment.succeeded", data: { payment_id: "pay_1" } })).toBeNull();
    expect(mapDodoEvent({ nope: true })).toBeNull();
  });

  it("leaves the lock empty when the metadata has none", () => {
    const json = JSON.parse(fixture("payment-succeeded"));
    json.data.metadata = { lock_id: "not-a-uuid" };
    expect(mapDodoEvent(json)).toMatchObject({ lockId: null, checkoutId: "cks_test_Xa81" });
  });
});

describe("DodoProvider", () => {
  const fetchMock = vi.fn();
  const provider = (mode: "test" | "live" = "test") => new DodoProvider({ mode, apiKey: "sk_test_key", webhookSecret: SECRET, productId: "pdt_test_crown" });
  const request = (body: string, headers = signed(body)) =>
    new Request("http://localhost/api/webhooks/dodo", {
      method: "POST",
      body,
      headers: { "webhook-id": headers.id, "webhook-timestamp": headers.timestamp, "webhook-signature": headers.signature },
    });

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    lockByCheckout = {};
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens a checkout for exactly the locked price, with the lock in metadata", async () => {
    fetchMock.mockResolvedValue(Response.json({ session_id: "cks_1", checkout_url: "https://test.checkout.dodopayments.com/session/cks_1" }));
    const checkout = await provider().createCheckout({
      lockId: LOCK,
      priceCents: 3400,
      email: "nadia@example.com",
      locale: "es",
      successUrl: "https://takethecrown.app/es?lock=x",
      cancelUrl: "https://takethecrown.app/es?lock=x&cancelled=1",
    });
    expect(checkout).toEqual({ checkoutId: "cks_1", url: "https://test.checkout.dodopayments.com/session/cks_1", mode: "redirect" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test.dodopayments.com/checkouts");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer sk_test_key");
    expect(JSON.parse(init.body as string)).toEqual({
      product_cart: [{ product_id: "pdt_test_crown", quantity: 1, amount: 3400 }],
      customer: { email: "nadia@example.com" },
      billing_currency: "USD",
      return_url: "https://takethecrown.app/es?lock=x",
      cancel_url: "https://takethecrown.app/es?lock=x&cancelled=1",
      metadata: { lock_id: LOCK },
    });
  });

  it("talks to the live API in live mode", async () => {
    fetchMock.mockResolvedValue(Response.json({ price: { type: "one_time_price", price: 500, pay_what_you_want: true } }));
    expect(await provider("live").minimumCents()).toBe(500);
    expect(fetchMock.mock.calls[0][0]).toBe("https://live.dodopayments.com/products/pdt_test_crown");
  });

  it("refunds a payment through the refund API", async () => {
    fetchMock.mockResolvedValue(Response.json({ refund_id: "ref_1", status: "pending" }));
    await provider().refund("pay_test_7Hq2Lc");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test.dodopayments.com/refunds");
    expect(JSON.parse(init.body as string)).toMatchObject({ payment_id: "pay_test_7Hq2Lc" });
  });

  it("fails loudly when Dodo refuses a call", async () => {
    fetchMock.mockResolvedValue(new Response("product below minimum", { status: 422 }));
    await expect(provider().refund("pay_1")).rejects.toThrow(/422/);
  });

  it("verifies webhooks and uses the webhook id as the event id", async () => {
    const body = fixture("payment-succeeded");
    expect(await provider().verifyWebhook(request(body))).toEqual({
      type: "payment_succeeded",
      eventId: "msg_2Xq8",
      providerPaymentId: "pay_test_7Hq2Lc",
      lockId: LOCK,
      amountCents: 3400,
      currency: "USD",
      email: "nadia@example.com",
    });
    expect(await provider().verifyWebhook(request(body, { ...signed(body), signature: "v1,Zm9yZ2Vk" }))).toBeNull();
  });

  it("finds the lock through the checkout session when metadata is missing", async () => {
    const json = JSON.parse(fixture("payment-succeeded"));
    delete json.data.metadata;
    const body = JSON.stringify(json);
    lockByCheckout = { cks_test_Xa81: LOCK };
    expect(await provider().verifyWebhook(request(body))).toMatchObject({ type: "payment_succeeded", lockId: LOCK });
    lockByCheckout = {};
    expect(await provider().verifyWebhook(request(body))).toEqual({ type: "ignored", eventId: "msg_2Xq8" });
  });
});

describe("payment settings", () => {
  const env = {
    SUPABASE_SERVICE_ROLE_KEY: "service",
    PAYMENT_WEBHOOK_SECRET: "webhook-secret-0123456789",
    IP_HASH_SALT: "salt-0123456789abcdef",
    NEXT_PUBLIC_SITE_URL: "https://takethecrown.app",
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  };
  const load = async (vars: Record<string, string>) => {
    vi.resetModules();
    for (const [key, value] of Object.entries({ ...env, ...vars })) vi.stubEnv(key, value);
    return import("@/lib/payments");
  };
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("counts the test provider and Dodo's test mode as test payments, so launch stays blocked", async () => {
    expect((await load({ PAYMENT_PROVIDER: "test" })).testPayments()).toBe(true);
    expect((await load({ PAYMENT_PROVIDER: "dodo", DODO_MODE: "test" })).testPayments()).toBe(true);
    expect((await load({ PAYMENT_PROVIDER: "dodo", DODO_MODE: "live" })).testPayments()).toBe(false);
  });

  it("reads the floor's lower bound from the Dodo product, and has none with the test provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ price: { type: "one_time_price", price: 500, pay_what_you_want: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const dodo = await load({ PAYMENT_PROVIDER: "dodo", DODO_MODE: "test", DODO_API_KEY: "k", DODO_WEBHOOK_SECRET: SECRET, DODO_PRODUCT_ID: "pdt_1" });
    expect(await dodo.paymentMinimumCents()).toBe(500);
    expect(await (await load({ PAYMENT_PROVIDER: "test" })).paymentMinimumCents()).toBeNull();
  });

  it("names the Dodo settings that are missing", async () => {
    const dodo = await load({ PAYMENT_PROVIDER: "dodo", DODO_API_KEY: "k" });
    expect(() => dodo.dodoProvider()).toThrow("Dodo Payments needs DODO_WEBHOOK_SECRET, DODO_PRODUCT_ID");
  });
});
