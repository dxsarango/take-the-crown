import { beforeEach, describe, expect, it, vi } from "vitest";
import { hailerCookie, hailerKey, newHailerId, readHailerId } from "@/lib/hail";

let sameOrigin = true;
let withinLimit = true;
let human = true;
let viewer: { profileId: string } | null = null;
let answer: { data: unknown; error: { message: string } | null } = { data: { status: "created", hails: 1 }, error: null };
const rpc = vi.fn(async (..._args: unknown[]) => answer);
vi.mock("@/lib/security/request", () => ({ sameOrigin: () => sameOrigin, clientIp: () => "203.0.113.9", hashIp: (ip: string) => `hash(${ip})` }));
vi.mock("@/lib/security/rate-limit", () => ({ withinHourlyLimit: async () => withinLimit }));
vi.mock("@/lib/security/human", () => ({ verifyHuman: async () => human }));
vi.mock("@/lib/auth/viewer", () => ({ currentViewer: async () => viewer }));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: () => ({ rpc }) }));

const { POST } = await import("@/app/api/hails/route");

const ID = "0123456789abcdef0123456789abcdef";
const call = (body: unknown, cookie?: string, url = "https://takethecrown.app/api/hails") =>
  POST(new Request(url, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));

describe("hailer cookie", () => {
  it("makes a 32-hex id and reads it back from a Cookie header", () => {
    expect(newHailerId()).toMatch(/^[0-9a-f]{32}$/);
    expect(readHailerId(`theme=dark; hailer=${ID}; other=1`)).toBe(ID);
  });

  it("ignores a missing or malformed id", () => {
    expect(readHailerId(null)).toBeNull();
    expect(readHailerId("theme=dark")).toBeNull();
    expect(readHailerId("hailer=not-an-id")).toBeNull();
    expect(readHailerId(`xhailer=${ID}`)).toBeNull();
  });

  it("is HttpOnly and long-lived, and Secure on https only", () => {
    expect(hailerCookie(ID, true)).toBe(`hailer=${ID}; Max-Age=34560000; Path=/; HttpOnly; SameSite=Lax; Secure`);
    expect(hailerCookie(ID, false)).not.toContain("Secure");
  });

  it("keys a hail by account when signed in, else by a hash of the browser's id", () => {
    expect(hailerKey("11111111-1111-4111-8111-111111111111", ID)).toBe("p:11111111-1111-4111-8111-111111111111");
    const device = hailerKey(null, ID);
    expect(device).toMatch(/^d:[0-9a-f]{64}$/);
    expect(device).not.toContain(ID);
    expect(hailerKey(null, ID)).toBe(device);
  });
});

describe("POST /api/hails", () => {
  beforeEach(() => {
    sameOrigin = true;
    withinLimit = true;
    human = true;
    viewer = null;
    answer = { data: { status: "created", hails: 1 }, error: null };
    rpc.mockClear();
  });

  it("hails for a visitor without an account and gives the browser its id", async () => {
    const response = await call({ reignId: 7 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "created", hails: 1 });
    const [name, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe("hail_reign");
    expect(args).toMatchObject({ p_reign_id: 7, p_ip_hash: "hash(203.0.113.9)", p_profile_id: undefined });
    expect(String(args.p_hailer_key)).toMatch(/^d:[0-9a-f]{64}$/);
    expect(response.headers.get("set-cookie")).toMatch(/^hailer=[0-9a-f]{32};.*HttpOnly.*Secure/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("recognizes a browser that already has its id, without setting it again", async () => {
    const first = await call({ reignId: 7 }, `hailer=${ID}`);
    const second = await call({ reignId: 7 }, `hailer=${ID}`);
    expect(first.headers.get("set-cookie")).toBeNull();
    const keys = rpc.mock.calls.map((c) => (c[1] as { p_hailer_key: string }).p_hailer_key);
    expect(keys[0]).toBe(keys[1]);
    expect(second.status).toBe(200);
  });

  it("hails under the account when signed in, whatever the browser's id", async () => {
    viewer = { profileId: "11111111-1111-4111-8111-111111111111" };
    await call({ reignId: 7 }, `hailer=${ID}`);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_hailer_key: "p:11111111-1111-4111-8111-111111111111",
      p_profile_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it.each(["duplicate", "own_reign"])("answers %s as a normal outcome with the count", async (status) => {
    answer = { data: { status, hails: 4 }, error: null };
    const response = await call({ reignId: 7 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status, hails: 4 });
  });

  it("refuses with 429 when one address has hailed too often for a reign", async () => {
    answer = { data: { status: "ip_limit", hails: 9 }, error: null };
    const response = await call({ reignId: 7 });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false, error: "ip_limit", hails: 9 });
  });

  it("refuses with 409 when the reign is over", async () => {
    answer = { data: { status: "not_current", hails: 0 }, error: null };
    expect((await call({ reignId: 7 })).status).toBe(409);
  });

  it("refuses without touching the database: another site, a bad body, the hourly limit, a failed bot check", async () => {
    sameOrigin = false;
    expect((await call({ reignId: 7 })).status).toBe(403);
    sameOrigin = true;
    for (const body of [null, {}, { reignId: 0 }, { reignId: "7" }, { reignId: 7.5 }]) expect((await call(body)).status).toBe(400);
    withinLimit = false;
    expect(await (await call({ reignId: 7 })).json()).toEqual({ ok: false, error: "rate_limited" });
    withinLimit = true;
    human = false;
    const response = await call({ reignId: 7 });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "human_check_failed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 500 when the database fails or answers something unexpected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    answer = { data: null, error: { message: "boom" } };
    expect((await call({ reignId: 7 })).status).toBe(500);
    answer = { data: { status: "surprise", hails: 1 }, error: null };
    expect((await call({ reignId: 7 })).status).toBe(500);
  });

  it("does not mark the cookie Secure over plain http (local development)", async () => {
    const response = await call({ reignId: 7 }, undefined, "http://localhost:3000/api/hails");
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });
});
