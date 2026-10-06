import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const viewer = { userId: "user-1", email: "admin@test.local", profileId: "profile-1", lastSignInAt: null };
let isAdmin: boolean;
let sessionId: string | undefined;
let session: { signed_in_at: string; aal: string; totp_factor_id: string | null } | null;
const config = { admin_session_seconds: 43_200, admin_reauth_seconds: 600 };

vi.mock("@/lib/auth/viewer", () => ({ currentViewer: async () => viewer }));
vi.mock("@/lib/supabase/session", () => ({
  sessionClient: async () => ({ auth: { getClaims: async () => ({ data: sessionId ? { claims: { session_id: sessionId } } : null }) } }),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { is_admin: isAdmin } }) }),
        single: async () => ({ data: table === "app_config" ? config : null, error: null }),
      }),
    }),
    rpc: async () => ({ data: session ? [session] : [] }),
  }),
}));

const { adminAccess } = await import("@/lib/admin/guard");
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

describe("adminAccess", () => {
  beforeEach(() => {
    isAdmin = true;
    sessionId = "session-1";
    session = { signed_in_at: ago(60), aal: "aal2", totp_factor_id: "factor-1" };
  });

  it("is null for players who are not admins", async () => {
    isAdmin = false;
    expect(await adminAccess()).toBeNull();
  });

  it("admits a recent, verified session and allows sensitive actions", async () => {
    expect(await adminAccess()).toMatchObject({ state: "ok", recent: true, limits: { sessionSeconds: 43_200, reauthSeconds: 600 } });
  });

  it("admits a session signed in over 10 minutes ago, but not for sensitive actions", async () => {
    session!.signed_in_at = ago(11 * 60);
    expect(await adminAccess()).toMatchObject({ state: "ok", recent: false });
  });

  it("asks for a new sign-in after 12 hours, before anything else", async () => {
    session = { signed_in_at: ago(12 * 3600 + 1), aal: "aal1", totp_factor_id: null };
    expect(await adminAccess()).toMatchObject({ state: "stale" });
  });

  it("treats an ended session or a token without a session as stale", async () => {
    session = null;
    expect(await adminAccess()).toMatchObject({ state: "stale" });
    sessionId = undefined;
    expect(await adminAccess()).toMatchObject({ state: "stale" });
  });

  it("asks for TOTP enrollment when the admin has no verified factor", async () => {
    session = { signed_in_at: ago(60), aal: "aal1", totp_factor_id: null };
    expect(await adminAccess()).toMatchObject({ state: "enroll" });
  });

  it("asks for the TOTP code when this session is still AAL1", async () => {
    session!.aal = "aal1";
    expect(await adminAccess()).toMatchObject({ state: "verify", factorId: "factor-1" });
  });
});
