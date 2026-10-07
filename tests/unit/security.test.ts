import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const env = {
  SUPABASE_SERVICE_ROLE_KEY: "service",
  PAYMENT_PROVIDER: "test",
  PAYMENT_WEBHOOK_SECRET: "webhook-secret-0123456789",
  IP_HASH_SALT: "salt-0123456789abcdef",
  NEXT_PUBLIC_SITE_URL: "https://crown.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};
for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

const { safeNext } = await import("@/lib/auth/next");
const { sameOrigin } = await import("@/lib/security/request");
const { contentSecurityPolicy, newNonce } = await import("@/lib/security/csp");
const { isFormerName, playerName, profileHref } = await import("@/lib/game/former");
const { fillPlaceholders, parseMarkdown } = await import("@/lib/legal/markdown");
const { legalSchema } = await import("@/lib/admin/config");
const { RANKS } = await import("@/lib/game/rank");

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/es/u/kenji?card=duke#top")).toBe("/es/u/kenji?card=duke#top");
    expect(safeNext("/")).toBe("/");
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/%09/evil.example".replace("%09", "\t"),
    "https://evil.example",
    "evil.example",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ])("sends %j to the fallback", (value) => {
    expect(safeNext(value)).toBe("/");
  });
});

describe("sameOrigin", () => {
  const request = (headers: Record<string, string>) => new Request("https://crown.test/api/profile", { method: "PATCH", headers });

  it("accepts the site's own origin and requests without one", () => {
    expect(sameOrigin(request({ origin: "https://crown.test", host: "crown.test" }))).toBe(true);
    expect(sameOrigin(request({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(sameOrigin(request({ host: "crown.test" }))).toBe(true);
  });

  it("refuses other origins", () => {
    expect(sameOrigin(request({ origin: "https://evil.example", host: "crown.test" }))).toBe(false);
    expect(sameOrigin(request({ origin: "null", host: "crown.test" }))).toBe(false);
  });
});

describe("client IP", () => {
  afterEach(() => {
    vi.resetModules();
    vi.stubEnv("CLOUDFLARE_ORIGIN_SECRET", "");
  });
  const load = async (secret: string) => {
    vi.resetModules();
    vi.stubEnv("CLOUDFLARE_ORIGIN_SECRET", secret);
    return import("@/lib/security/request");
  };
  const spoofed = { "cf-connecting-ip": "6.6.6.6", "cf-ipcountry": "KP", "x-real-ip": "1.2.3.4", "x-vercel-ip-country": "EC" };

  it("ignores Cloudflare's headers unless the request came through the zone", async () => {
    const { clientIp, requestCountry } = await load("");
    expect(clientIp(new Headers(spoofed))).toBe("1.2.3.4");
    expect(requestCountry(new Headers(spoofed))).toBe("EC");
  });

  it("trusts them with the origin secret", async () => {
    const secret = "s".repeat(40);
    const { clientIp, requestCountry } = await load(secret);
    expect(clientIp(new Headers({ ...spoofed, "x-origin-secret": "wrong" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ ...spoofed, "x-origin-secret": secret }))).toBe("6.6.6.6");
    expect(requestCountry(new Headers({ ...spoofed, "x-origin-secret": secret }))).toBe("KP");
  });
});

describe("country detection", () => {
  afterEach(() => {
    vi.resetModules();
    vi.stubEnv("CLOUDFLARE_ORIGIN_SECRET", "");
  });
  const secret = "s".repeat(40);
  const load = async (configured: string) => {
    vi.resetModules();
    vi.stubEnv("CLOUDFLARE_ORIGIN_SECRET", configured);
    return (await import("@/lib/security/request")).detectCountry;
  };
  // A visitor in Ecuador through Cloudflare's Miami edge: Vercel geolocates the edge.
  const viaMiami = { "cf-ipcountry": "EC", "x-vercel-ip-country": "US" };

  it("uses Cloudflare's country when the origin secret is valid", async () => {
    const detect = await load(secret);
    expect(detect(new Headers({ ...viaMiami, "x-origin-secret": secret }))).toEqual({ country: "EC", source: "cloudflare", cloudflare: "trusted" });
  });

  it("falls back to Vercel's geolocation and says why Cloudflare was not trusted", async () => {
    const configured = await load(secret);
    expect(configured(new Headers(viaMiami))).toEqual({ country: "US", source: "vercel", cloudflare: "no_secret_header" });
    expect(configured(new Headers({ ...viaMiami, "x-origin-secret": "x".repeat(40) }))).toEqual({ country: "US", source: "vercel", cloudflare: "wrong_secret" });
    expect(configured(new Headers({ ...viaMiami, "x-origin-secret": "short" }))).toMatchObject({ source: "vercel", cloudflare: "wrong_secret" });
    const unconfigured = await load("");
    expect(unconfigured(new Headers({ ...viaMiami, "x-origin-secret": secret }))).toEqual({ country: "US", source: "vercel", cloudflare: "not_configured" });
  });

  it("falls back to Vercel when Cloudflare has no usable country, and reports none without either", async () => {
    const detect = await load(secret);
    for (const unknown of ["XX", "T1", "", "ecuador"]) {
      expect(detect(new Headers({ "cf-ipcountry": unknown, "x-vercel-ip-country": "EC", "x-origin-secret": secret }))).toEqual({
        country: "EC",
        source: "vercel",
        cloudflare: "trusted",
      });
    }
    expect(detect(new Headers({ "x-origin-secret": secret }))).toEqual({ country: null, source: null, cloudflare: "trusted" });
  });

  it("answers /api/geo with the country, its source and the trust state, never the secret", async () => {
    vi.resetModules();
    vi.stubEnv("CLOUDFLARE_ORIGIN_SECRET", secret);
    const { GET } = await import("@/app/api/geo/route");
    const response = GET(new Request("https://takethecrown.app/api/geo", { headers: { ...viaMiami, "x-origin-secret": secret } }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ country: "EC", source: "cloudflare", cloudflare: "trusted" });
    expect(body).not.toContain(secret);
  });
});

describe("check:deploy country report", () => {
  it("passes with Cloudflare as the source", async () => {
    const { countryReport } = await import("@/scripts/geo-report.mjs");
    expect(countryReport({ country: "EC", source: "cloudflare", cloudflare: "trusted" })).toEqual({
      status: "PASS",
      detail: "EC (source: Cloudflare cf-ipcountry)",
    });
  });

  it("warns with Vercel as the source and names the cause", async () => {
    const { countryReport } = await import("@/scripts/geo-report.mjs");
    expect(countryReport({ country: "US", source: "vercel", cloudflare: "no_secret_header" })).toEqual({
      status: "WARN",
      detail: expect.stringMatching(/^US \(source: Vercel geolocation.*no x-origin-secret.*Transform Rule/),
    });
    expect(countryReport({ country: "US", source: "vercel", cloudflare: "wrong_secret" }).detail).toContain("does not match CLOUDFLARE_ORIGIN_SECRET");
    expect(countryReport({ country: "US", source: "vercel", cloudflare: "not_configured" }).detail).toContain("is not set on Vercel");
    expect(countryReport({ country: null, source: null, cloudflare: "trusted" })).toEqual({
      status: "WARN",
      detail: "none (source: none; not Cloudflare because Cloudflare sent no country)",
    });
  });
});

describe("verifyHuman", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "test");
  });
  const load = async (secret: string, nodeEnv = "test") => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", secret);
    vi.stubEnv("NODE_ENV", nodeEnv);
    return (await import("@/lib/security/human")).verifyHuman;
  };
  const answer = (body: unknown) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));

  it("is off without a secret outside production, and fails closed in production", async () => {
    expect(await (await load(""))(null, "1.2.3.4", "lock")).toBe(true);
    expect(await (await load("", "production"))("token", "1.2.3.4", "lock")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Cloudflare and accepts a token for the same action", async () => {
    const verify = await load("secret-key");
    answer({ success: true, action: "lock" });
    expect(await verify("token", "1.2.3.4", "lock")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ secret: "secret-key", response: "token", remoteip: "1.2.3.4" });
  });

  it("refuses missing, failed, reused-elsewhere and unverifiable tokens", async () => {
    const verify = await load("secret-key");
    expect(await verify(undefined, "1.2.3.4", "lock")).toBe(false);
    answer({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await verify("token", "1.2.3.4", "lock")).toBe(false);
    answer({ success: true, action: "profile" });
    expect(await verify("token", "1.2.3.4", "lock")).toBe(false);
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await verify("token", "1.2.3.4", "lock")).toBe(false);
  });
});

describe("content security policy", () => {
  const policy = (dev = false, https = true) =>
    Object.fromEntries(
      contentSecurityPolicy({ nonce: "abc", supabaseUrl: "https://abc.supabase.co", dev, https })
        .split("; ")
        .map((d) => [d.split(" ")[0], d.split(" ").slice(1)]),
    );

  it("runs only nonce scripts, with Turnstile as the only third party", () => {
    const p = policy();
    expect(p["script-src"]).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'", "https://challenges.cloudflare.com"]);
    expect(p["script-src"]).not.toContain("'unsafe-inline'");
    expect(p["frame-src"]).toEqual(["https://challenges.cloudflare.com"]);
    expect(p["connect-src"]).toEqual(["'self'", "https://abc.supabase.co", "wss://abc.supabase.co"]);
    expect(p["object-src"]).toEqual(["'none'"]);
    expect(p["base-uri"]).toEqual(["'none'"]);
    expect(p["frame-ancestors"]).toEqual(["'none'"]);
    expect(p["upgrade-insecure-requests"]).toEqual([]);
  });

  it("allows eval and the dev socket only in development", () => {
    expect(policy(true, false)["script-src"]).toContain("'unsafe-eval'");
    expect(policy()["script-src"]).not.toContain("'unsafe-eval'");
    expect(policy(true, false)["upgrade-insecure-requests"]).toBeUndefined();
  });

  it("makes a fresh 128-bit nonce each time", () => {
    const a = newNonce();
    expect(atob(a)).toHaveLength(16);
    expect(newNonce()).not.toBe(a);
  });
});

describe("deleted players", () => {
  it("show as Former king and have no profile link", () => {
    expect(isFormerName("former~0123456789ab")).toBe(true);
    expect(isFormerName("former_king")).toBe(false);
    expect(playerName("former~0123456789ab", "Antiguo rey")).toBe("Antiguo rey");
    expect(playerName("Kenji", "Former king")).toBe("Kenji");
    expect(profileHref("former~0123456789ab")).toBeUndefined();
    expect(profileHref("Kenji")).toBe("/u/kenji");
  });
});

describe("legal pages", () => {
  const dir = path.join(process.cwd(), "docs", "legal");
  const docs = readdirSync(dir).filter((f) => /^[a-z]+\.(en|es)\.md$/.test(f));
  const values = {
    BRAND: "Take the Crown",
    DOMAIN: "crown.test",
    CONTACT_EMAIL: "legal@crown.test",
    CITY: "Loja",
    PAYMENT_PROVIDER: "Paddle",
    EFFECTIVE_DATE: "1 November 2026",
    floor: "$5",
    step: "20%",
    decay: "2%",
    lock_minutes: "5",
    grace_minutes: "10",
    max_message: "80",
  };

  it("has every page in both languages", () => {
    expect(docs.sort()).toEqual(["faq", "privacy", "rules", "terms"].flatMap((d) => [`${d}.en.md`, `${d}.es.md`]));
  });

  it.each(docs)("fills every placeholder in %s and starts with its title", (file) => {
    const source = readFileSync(path.join(dir, file), "utf8");
    const filled = fillPlaceholders(source, values);
    expect(filled).not.toMatch(/\{\{?[A-Za-z_]+\}\}?/);
    const blocks = parseMarkdown(filled);
    expect(blocks[0].kind).toBe("title");
  });

  it("numbers the delivery section the checkout links to", () => {
    for (const locale of ["en", "es"]) {
      const blocks = parseMarkdown(readFileSync(path.join(dir, `terms.${locale}.md`), "utf8"));
      expect(blocks.find((b) => b.kind === "heading" && b.id === "s5")).toBeTruthy();
    }
  });

  it("leaves details the admin has not filled in as placeholders", () => {
    expect(fillPlaceholders("Contact: {{CONTACT_EMAIL}}. Floor {floor}.", { CONTACT_EMAIL: null, floor: "$5" })).toBe(
      "Contact: {{CONTACT_EMAIL}}. Floor $5.",
    );
  });

  it("parses bold, emails, lists, tables and FAQ questions", () => {
    const blocks = parseMarkdown(
      "# Title\n\n## 3. Section\n\n**Account.** Write to a@b.co.\n\n- one\n- **two**\n\n| A | B |\n|---|---|\n| x | y |\n\n**Question?**\nAnswer here.",
    );
    expect(blocks).toEqual([
      { kind: "title", text: "Title" },
      { kind: "heading", id: "s3", text: "3. Section" },
      {
        kind: "paragraph",
        content: [
          { kind: "bold", text: "Account." },
          { kind: "text", text: " Write to " },
          { kind: "email", text: "a@b.co" },
          { kind: "text", text: "." },
        ],
      },
      { kind: "list", items: [[{ kind: "text", text: "one" }], [{ kind: "bold", text: "two" }]] },
      { kind: "table", head: ["A", "B"], rows: [["x", "y"]] },
      { kind: "question", question: [{ kind: "bold", text: "Question?" }], answer: [{ kind: "text", text: "Answer here." }] },
    ]);
  });

  it("states the same rank thresholds as the game", () => {
    for (const locale of ["en", "es"]) {
      const table = parseMarkdown(readFileSync(path.join(dir, `rules.${locale}.md`), "utf8")).find((b) => b.kind === "table");
      if (table?.kind !== "table") throw new Error("no ranks table");
      const hours = table.rows.map((row) => Number(row[1].split(" ")[0]));
      expect(hours).toEqual(RANKS.map((r) => r.minSeconds / 3600));
    }
  });

  it("validates the legal details the admin enters", () => {
    expect(legalSchema.parse({ legal_contact_email: " legal@crown.test ", legal_city: "", legal_payment_provider: "Paddle", legal_effective_date: "2026-11-01" })).toEqual({
      legal_contact_email: "legal@crown.test",
      legal_city: null,
      legal_payment_provider: "Paddle",
      legal_effective_date: "2026-11-01",
    });
    expect(legalSchema.safeParse({ legal_contact_email: "nope", legal_city: "", legal_payment_provider: "", legal_effective_date: "" }).success).toBe(false);
    expect(legalSchema.safeParse({ legal_contact_email: "", legal_city: "", legal_payment_provider: "", legal_effective_date: "01/11/2026" }).success).toBe(false);
  });
});
