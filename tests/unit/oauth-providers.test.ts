import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_SUPABASE_URL: "https://ref.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" } }));

const signInWithOAuth = vi.fn(async (_args: { provider: string; options: Record<string, unknown> }) => ({
  data: { url: "https://ref.supabase.co/auth/v1/authorize?provider=x" },
  error: null as { message: string } | null,
}));
const exchangeCodeForSession = vi.fn(async (_code: string) => ({
  data: { user: null },
  error: { code: "flow_state_not_found", message: "invalid flow state, no valid flow state found" } as { code: string; message: string } | null,
}));
vi.mock("@/lib/supabase/session", () => ({ sessionClient: async () => ({ auth: { signInWithOAuth, exchangeCodeForSession } }) }));
vi.mock("@/lib/auth/viewer", () => ({ ensureProfile: vi.fn() }));
vi.mock("@/lib/auth/magic-link", () => ({ callbackUrl: (next: string) => `https://takethecrown.app/auth/callback?next=${encodeURIComponent(next)}` }));

const { isProviderEnabled } = await import("@/lib/auth/providers");
const { GET } = await import("@/app/auth/sign-in/[provider]/route");
const callback = await import("@/app/auth/callback/route");

const fetchMock = vi.fn<typeof fetch>();
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  signInWithOAuth.mockClear();
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  logged.mockRestore();
});

const redirectTo = (location: string) => new Response(null, { status: 302, headers: { location } });
const disabled = () =>
  new Response(JSON.stringify({ code: 400, error_code: "validation_failed", msg: "Unsupported provider: provider is not enabled" }), { status: 400 });

describe("isProviderEnabled", () => {
  it("asks Supabase's authorize endpoint for the OAuth 2.0 X provider, without following the redirect", async () => {
    fetchMock.mockResolvedValue(redirectTo("https://x.com/i/oauth2/authorize?client_id=c&scope=users.email+tweet.read+users.read+offline.access"));
    expect(await isProviderEnabled("x")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://ref.supabase.co/auth/v1/authorize?provider=x");
    expect(init).toMatchObject({ redirect: "manual", cache: "no-store" });
    expect(logged).not.toHaveBeenCalled();
  });

  it("answers no and logs Supabase's reason when the provider is off", async () => {
    fetchMock.mockResolvedValue(disabled());
    expect(await isProviderEnabled("x")).toBe(false);
    expect(logged).toHaveBeenCalledWith(expect.stringMatching(/"x" is unavailable: Supabase answered 400 .*provider is not enabled/));
  });

  it("answers no and logs when Supabase Auth cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await isProviderEnabled("google")).toBe(false);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('"google" is unavailable: could not reach Supabase Auth'), "fetch failed");
  });
});

describe("GET /auth/sign-in/[provider]", () => {
  const start = (provider: string) =>
    GET(new Request(`https://takethecrown.app/auth/sign-in/${provider}?next=%2Fes`), { params: Promise.resolve({ provider }) } as never);

  it("starts X sign-in with Supabase's OAuth 2.0 provider id", async () => {
    fetchMock.mockResolvedValue(redirectTo("https://x.com/i/oauth2/authorize"));
    const response = await start("x");
    expect(response.status).toBe(307);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "x",
      options: { redirectTo: "https://takethecrown.app/auth/callback?next=%2Fes", skipBrowserRedirect: true },
    });
  });

  it("does not offer the legacy OAuth 1.0a provider", async () => {
    expect((await start("twitter")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the player back with the notice when the provider is off", async () => {
    fetchMock.mockResolvedValue(disabled());
    const response = await start("x");
    expect(response.headers.get("location")).toBe("https://takethecrown.app/es?auth_error=unavailable");
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("logs why Supabase could not start the sign-in", async () => {
    fetchMock.mockResolvedValue(redirectTo("https://x.com/i/oauth2/authorize"));
    signInWithOAuth.mockResolvedValueOnce({ data: { url: "" }, error: { message: "boom" } });
    const response = await start("x");
    expect(response.headers.get("location")).toBe("https://takethecrown.app/es?auth_error=failed");
    expect(logged).toHaveBeenCalledWith('OAuth sign-in with "x" could not start:', "boom");
  });
});

describe("GET /auth/callback", () => {
  it("logs the provider's reason when sign-in comes back without a code", async () => {
    const response = await callback.GET(
      new Request("https://takethecrown.app/auth/callback?next=%2Fen&error=server_error&error_code=unexpected_failure&error_description=Error+getting+user+email+from+external+provider"),
    );
    expect(response.headers.get("location")).toBe("https://takethecrown.app/en?auth_error=failed");
    expect(logged).toHaveBeenCalledWith("Sign-in came back without a code:", "server_error: unexpected_failure: Error getting user email from external provider");
  });

  it("logs why the code exchange failed", async () => {
    const response = await callback.GET(new Request("https://takethecrown.app/auth/callback?next=%2Fen&code=abc"));
    expect(response.headers.get("location")).toBe("https://takethecrown.app/en?auth_error=failed");
    expect(logged).toHaveBeenCalledWith("Sign-in code exchange failed:", "flow_state_not_found", "invalid flow state, no valid flow state found");
  });
});
