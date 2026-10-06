import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const user = { id: "user-1", email: "player@test.local", user_metadata: {}, last_sign_in_at: "2026-10-06T12:00:00Z" };
let getUser: () => Promise<unknown>;
let rpc: () => Promise<unknown>;
const signOut = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/session", () => ({ sessionClient: async () => ({ auth: { getUser: () => getUser(), signOut } }) }));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: () => ({ rpc: () => rpc() }) }));

const { currentViewer } = await import("@/lib/auth/viewer");

describe("currentViewer", () => {
  beforeEach(() => {
    signOut.mockClear();
    getUser = async () => ({ data: { user }, error: null });
    rpc = async () => ({ data: "profile-1", error: null });
  });

  it("returns the signed-in player with their profile", async () => {
    expect(await currentViewer()).toEqual({ userId: "user-1", email: "player@test.local", profileId: "profile-1", lastSignInAt: user.last_sign_in_at });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out a session whose user no longer exists", async () => {
    getUser = async () => ({ data: { user: null }, error: { code: "user_not_found", message: "User from sub claim in JWT does not exist" } });
    expect(await currentViewer()).toBeNull();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("signs out when the user is deleted while the profile is being saved", async () => {
    rpc = async () => ({ data: null, error: { code: "23503", message: 'violates foreign key constraint "profiles_user_id_fkey"' } });
    expect(await currentViewer()).toBeNull();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("still fails loudly on other database errors", async () => {
    rpc = async () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    await expect(currentViewer()).rejects.toThrow(/Could not resolve profile/);
  });
});
