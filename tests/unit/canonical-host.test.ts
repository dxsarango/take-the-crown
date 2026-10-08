import { describe, expect, it } from "vitest";
import { canonicalRedirect, enforcesCanonicalHost } from "@/lib/security/canonical-host";

const SECRET = "cron-secret-of-sixteen+";
const base = { siteUrl: "https://takethecrown.app", cronSecret: SECRET, authorization: null as string | null };
const go = (url: string, host: string | null, extra: Partial<typeof base> = {}) =>
  canonicalRedirect({ ...base, ...extra, url: new URL(url), host });

describe("canonicalRedirect", () => {
  it("serves the canonical host", () => {
    expect(go("https://takethecrown.app/en?x=1", "takethecrown.app")).toBeNull();
    expect(go("https://takethecrown.app/en", "TakeTheCrown.app")).toBeNull();
  });

  it.each([
    ["https://take-the-crown.vercel.app/en/kingdom?season=genesis", "take-the-crown.vercel.app", "https://takethecrown.app/en/kingdom?season=genesis"],
    ["https://take-the-crown-abc123-team.vercel.app/", "take-the-crown-abc123-team.vercel.app", "https://takethecrown.app/"],
    ["https://www.takethecrown.app/es", "www.takethecrown.app", "https://takethecrown.app/es"],
    ["https://takethecrown.app/api/locks", "takethecrown.app:8443", "https://takethecrown.app/api/locks"],
    ["https://evil.example/api/webhooks/dodo", "evil.example", "https://takethecrown.app/api/webhooks/dodo"],
  ])("sends %s to the canonical domain", (url, host, expected) => {
    expect(go(url, host)).toBe(expected);
  });

  it("sends a request without a host header to the canonical domain", () => {
    expect(go("https://takethecrown.app/en", null)).toBe("https://takethecrown.app/en");
  });

  it("serves a cron route with the right secret on any host", () => {
    for (const path of ["/api/cron/moderation", "/api/cron/notifications", "/api/cron/refunds"]) {
      expect(go(`https://take-the-crown.vercel.app${path}`, "take-the-crown.vercel.app", { authorization: `Bearer ${SECRET}` })).toBeNull();
    }
  });

  it("redirects a cron route without the secret, with a wrong one, or when none is configured", () => {
    const url = "https://take-the-crown.vercel.app/api/cron/refunds";
    const host = "take-the-crown.vercel.app";
    const target = "https://takethecrown.app/api/cron/refunds";
    expect(go(url, host)).toBe(target);
    expect(go(url, host, { authorization: "Bearer nope" })).toBe(target);
    expect(go(url, host, { authorization: `Bearer ${SECRET}x` })).toBe(target);
    expect(go(url, host, { authorization: SECRET })).toBe(target);
    expect(go(url, host, { authorization: "Bearer undefined", cronSecret: undefined })).toBe(target);
    expect(go(url, host, { authorization: "Bearer ", cronSecret: "" })).toBe(target);
  });

  it("does not let the secret open any other route", () => {
    const authorization = `Bearer ${SECRET}`;
    for (const path of ["/api/locks", "/en", "/api/cronjob", "/admin"]) {
      expect(go(`https://take-the-crown.vercel.app${path}`, "take-the-crown.vercel.app", { authorization })).toBe(`https://takethecrown.app${path}`);
    }
  });
});

describe("enforcesCanonicalHost", () => {
  it("is on for the live site and off for development and previews", () => {
    expect(enforcesCanonicalHost({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(true);
    expect(enforcesCanonicalHost({ NODE_ENV: "production" })).toBe(true);
    expect(enforcesCanonicalHost({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe(false);
    expect(enforcesCanonicalHost({ NODE_ENV: "development" })).toBe(false);
    expect(enforcesCanonicalHost({})).toBe(false);
  });
});
