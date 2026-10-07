import { describe, expect, it, vi } from "vitest";
import { localHour, lockRequestSchema, normalizeLink } from "@/lib/locks/input";
import { LOCK_DB_ERRORS, lockErrorFromDb } from "@/lib/locks/outcome";

vi.mock("server-only", () => ({}));
const { TestProvider, signTestPayload, TEST_SIGNATURE_HEADER } = await import("@/lib/payments/test-provider");

const valid = { name: "nadia.builds", email: "nadia@example.com", locale: "en" as const, acceptWithdrawal: true };

describe("lock request", () => {
  it("normalizes links to https", () => {
    expect(normalizeLink("turno.app")).toBe("https://turno.app");
    expect(normalizeLink(" https://turno.app/beta ")).toBe("https://turno.app/beta");
    expect(normalizeLink("")).toBe("");
  });

  it("accepts a minimal guest request", () => {
    const parsed = lockRequestSchema.parse(valid);
    expect(parsed).toMatchObject({ name: "nadia.builds", link: null, message: null, country: null });
  });

  it("cleans up the message and link", () => {
    const parsed = lockRequestSchema.parse({ ...valid, message: "  Beta\n is  open ", link: "turno.app" });
    expect(parsed.message).toBe("Beta is open");
    expect(parsed.link).toBe("https://turno.app");
  });

  it.each([
    [{ name: "ab" }, "name"],
    [{ name: "has space" }, "name"],
    [{ email: "nope" }, "email"],
    [{ link: "http://turno.app" }, "link"],
    [{ link: "javascript:alert(1)" }, "link"],
    [{ link: "localhost" }, "link"],
    [{ country: "ecuador" }, "country"],
    [{ avatarSeed: "xyz" }, "avatarSeed"],
    [{ avatarSeed: "0".repeat(32) }, "avatarSeed"],
    [{ locale: "fr" }, "locale"],
    [{ acceptWithdrawal: false }, "acceptWithdrawal"],
    [{ acceptWithdrawal: undefined }, "acceptWithdrawal"],
  ])("rejects %j", (patch, field) => {
    const result = lockRequestSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(field);
  });

  it("derives the buyer's local hour from their time zone", () => {
    const at = new Date("2026-10-10T08:30:00Z");
    expect(localHour("America/Guayaquil", at)).toBe(3);
    expect(localHour("Asia/Tokyo", at)).toBe(17);
    expect(localHour("Not/AZone", at)).toBeNull();
    expect(localHour(undefined, at)).toBeNull();
  });
});

describe("database errors", () => {
  it.each(LOCK_DB_ERRORS)("maps %s to its UI state", (code) => {
    expect(lockErrorFromDb(code)).toBe(code);
  });

  it("maps verification, link checks and unknown errors", () => {
    expect(lockErrorFromDb("email_verification_required")).toBe("email_verification_required");
    expect(lockErrorFromDb('new row violates check constraint "price_locks_link_format"')).toBe("invalid_link");
    expect(lockErrorFromDb("connection reset")).toBeNull();
  });
});

describe("test provider webhooks", () => {
  const secret = "s".repeat(32);
  const provider = new TestProvider(secret, "http://localhost:3000");
  const event = {
    type: "payment_succeeded",
    eventId: "evt_1",
    providerPaymentId: "pay_1",
    lockId: "7b0d2c4e-8f1a-4a57-9c1e-2f3d4b5a6c7d",
    amountCents: 3400,
    currency: "USD",
    email: "nadia@example.com",
  };
  const request = (body: string, signature: string) =>
    new Request("http://localhost/api/webhooks/test", { method: "POST", body, headers: { [TEST_SIGNATURE_HEADER]: signature } });

  it("accepts a correctly signed event", async () => {
    const body = JSON.stringify(event);
    expect(await provider.verifyWebhook(request(body, signTestPayload(body, secret)))).toEqual(event);
  });

  it("rejects a bad signature, a tampered body and a malformed event", async () => {
    const body = JSON.stringify(event);
    expect(await provider.verifyWebhook(request(body, "0".repeat(64)))).toBeNull();
    const tampered = JSON.stringify({ ...event, amountCents: 1 });
    expect(await provider.verifyWebhook(request(tampered, signTestPayload(body, secret)))).toBeNull();
    const malformed = JSON.stringify({ type: "payment_succeeded" });
    expect(await provider.verifyWebhook(request(malformed, signTestPayload(malformed, secret)))).toBeNull();
  });

  it("opens checkout as an overlay", async () => {
    const checkout = await provider.createCheckout({
      lockId: event.lockId,
      priceCents: 3400,
      email: event.email,
      locale: "en",
      successUrl: "http://localhost:3000/en",
      cancelUrl: "http://localhost:3000/en?cancelled=1",
    });
    expect(checkout.mode).toBe("overlay");
    expect(checkout.checkoutId).toMatch(/^test_chk_/);
  });
});

describe("player text", () => {
  const c = (...codes: number[]) => String.fromCharCode(...codes);
  const parse = (message: string) => lockRequestSchema.parse({ ...valid, message }).message;

  it("drops direction overrides and isolates, so text cannot be flipped or reordered", () => {
    // RIGHT-TO-LEFT OVERRIDE makes "nimda" display as "admin".
    expect(parse(`Talk to ${c(0x202e)}nimda${c(0x202c)} now`)).toBe("Talk to nimda now");
    expect(parse(`${c(0x2067)}abc${c(0x2069)} ${c(0x200f)}x${c(0x200e)}${c(0x061c)}`)).toBe("abc x");
  });

  it("drops zero-width spaces, soft hyphens, byte order marks and control characters", () => {
    expect(parse(`fr${c(0x200b)}ee m${c(0x00ad)}oney${c(0xfeff)}${c(0x2060)}${c(0x0007)}${c(0x0085)}`)).toBe("free money");
    expect(parse(`line${c(0x0000)}one`)).toBe("lineone");
  });

  it("keeps emoji sequences, accents and other scripts intact", () => {
    const family = `${c(0xd83d, 0xdc69)}${c(0x200d)}${c(0xd83d, 0xdc67)}`;
    expect(parse(`Reino de ñandú ${family} مرحبا 你好`)).toBe(`Reino de ñandú ${family} مرحبا 你好`);
  });

  it("treats a message of only invisible characters as no message", () => {
    expect(parse(`${c(0x200b)}${c(0x202e)} ${c(0xfeff)}`)).toBeNull();
  });
});
