import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateHome = vi.fn();
const revalidatePath = vi.fn();
let current = { name: "oldking", main_link: null as string | null, is_banned: false };
let saved = { name: "OldKing" };
const rpc = vi.fn(async () => ({ data: saved, error: null }));

function table(row: unknown) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) builder[m] = () => builder;
  builder.single = async () => ({ data: row, error: null });
  return builder;
}

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/lib/home/cache", () => ({ revalidateHome: () => revalidateHome() }));
vi.mock("@/lib/security/request", () => ({ sameOrigin: () => true, clientIp: () => "203.0.113.7" }));
vi.mock("@/lib/security/human", () => ({ verifyHuman: async () => true }));
vi.mock("@/lib/security/rate-limit", () => ({ withinHourlyLimit: async () => true }));
vi.mock("@/lib/moderation", () => ({ moderate: async () => ({ verdict: "allow" }) }));
vi.mock("@/lib/auth/viewer", () => ({
  currentViewer: async () => ({ userId: "u", email: "p@test.local", profileId: "p1", lastSignInAt: new Date().toISOString() }),
}));
vi.mock("@/lib/auth/reauth", () => ({ emailReauthLink: vi.fn(), within: () => true }));
vi.mock("@/lib/profile/delete", () => ({ deleteAccount: async () => true }));
vi.mock("@/lib/supabase/session", () => ({ sessionClient: async () => ({ auth: { signOut: async () => ({}) } }) }));
vi.mock("@/lib/profile/settings", () => ({
  settingsSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  toUpdateArgs: () => ({ args: {} }),
  mainLinkUrl: () => null,
  fieldForDbError: () => null,
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({
    rpc,
    from: (name: string) => table(name === "app_config" ? { floor_cents: 500, delete_reauth_seconds: 600 } : current),
  }),
}));

const { PATCH, DELETE } = await import("@/app/api/profile/route");
const request = (method: string, body: unknown) =>
  new Request("https://takethecrown.app/api/profile", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("profile changes drop the cached public pages", () => {
  beforeEach(() => {
    revalidateHome.mockClear();
    revalidatePath.mockClear();
    current = { name: "oldking", main_link: null, is_banned: false };
  });

  it("on a profile edit", async () => {
    saved = { name: "oldking" };
    const response = await PATCH(request("PATCH", { name: "oldking", link: "" }));
    expect(response.status).toBe(200);
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it("on a name change", async () => {
    saved = { name: "NewKing" };
    const response = await PATCH(request("PATCH", { name: "NewKing", link: "" }));
    expect(response.status).toBe(200);
    expect(revalidateHome).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/u/newking", "page");
  });

  it("on account deletion", async () => {
    const response = await DELETE(request("DELETE", { confirmName: "OldKing" }));
    expect(response.status).toBe(200);
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it("not when the deletion was not confirmed", async () => {
    const response = await DELETE(request("DELETE", { confirmName: "someone" }));
    expect(response.status).toBe(400);
    expect(revalidateHome).not.toHaveBeenCalled();
  });
});
