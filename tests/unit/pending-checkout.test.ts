import { describe, expect, it } from "vitest";
import { parsePending } from "@/lib/locks/pending";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const stored = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ lockId: "7d1c8f0e-0000-4000-8000-000000000001", url: "https://checkout.dodopayments.com/session/abc", expiresAt: new Date(NOW + 279_000).toISOString(), ...over });

describe("parsePending", () => {
  it("returns an unexpired checkout", () => {
    expect(parsePending(stored(), NOW)).toMatchObject({ url: "https://checkout.dodopayments.com/session/abc" });
  });

  it("drops one whose lock has run out", () => {
    expect(parsePending(stored({ expiresAt: new Date(NOW - 1).toISOString() }), NOW)).toBeNull();
  });

  it("ignores empty, malformed and incomplete values", () => {
    expect(parsePending(null, NOW)).toBeNull();
    expect(parsePending("not json", NOW)).toBeNull();
    expect(parsePending(stored({ lockId: 5 }), NOW)).toBeNull();
    expect(parsePending(stored({ expiresAt: "soon" }), NOW)).toBeNull();
  });

  it("never sends the buyer to anything but an https address", () => {
    expect(parsePending(stored({ url: "javascript:alert(1)" }), NOW)).toBeNull();
    expect(parsePending(stored({ url: "http://checkout.example" }), NOW)).toBeNull();
  });
});
