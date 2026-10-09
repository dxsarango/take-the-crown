import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateHome = vi.fn();
const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({ data: { id: PAYMENT } as unknown, error: null as { message: string } | null }));

// A query builder that answers every chain with the rows of its table.
function table(rows: unknown) {
  const result = { data: rows, error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq", "update", "insert", "single", "maybeSingle"]) builder[m] = () => builder;
  builder.then = (resolve: (v: typeof result) => unknown) => resolve(result);
  return builder;
}

const SEASONS = [
  { id: 0, starts_at: "2098-12-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z" },
  { id: 1, starts_at: "2099-01-01T00:00:00Z", ends_at: "2099-02-01T00:00:00Z" },
];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/home/cache", () => ({ revalidateHome: () => revalidateHome() }));
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/admin/guard", () => ({
  adminAccess: async () => ({ state: "ok", recent: true, admin: { userId: "u", profileId: ADMIN, email: "admin@test.local" } }),
}));
vi.mock("@/lib/auth/reauth", () => ({ emailReauthLink: vi.fn() }));
vi.mock("@/lib/supabase/session", () => ({ sessionClient: vi.fn() }));
vi.mock("@/lib/payments", () => ({ paymentMinimumCents: async () => null, testPayments: () => false }));
vi.mock("@/lib/payments/refunds", () => ({ requestRefund: async () => "requested" }));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({ rpc, from: (name: string) => table(name === "seasons" ? SEASONS : null) }),
}));

const ADMIN = "0c6f7a52-3a59-4d34-9f0e-7a1c2f9d1e01";
const PROFILE = "5b1e2f3a-4c5d-4e6f-8a7b-9c0d1e2f3a4b";
const PAYMENT = "8d7c6b5a-4f3e-4d2c-9b1a-0f9e8d7c6b5a";

const actions = await import("@/app/[locale]/admin/actions");

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  f.set("locale", "en");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("admin actions drop the cached public pages", () => {
  beforeEach(() => {
    revalidateHome.mockClear();
    rpc.mockClear();
  });

  it.each([
    ["hiding a message", () => actions.hideMessage(form({ reignId: "7" })), "hide_reign_message"],
    ["rejecting held content", () => actions.reviewContent(form({ reignId: "7", decision: "reject", reason: "hate" })), "review_reign_moderation"],
    ["approving held content", () => actions.reviewContent(form({ reignId: "7", decision: "approve" })), "review_reign_moderation"],
    ["banning a player", () => actions.setBanned(form({ profileId: PROFILE, banned: "true" })), "set_profile_banned"],
    ["lifting a ban", () => actions.setBanned(form({ profileId: PROFILE, banned: "false" })), "set_profile_banned"],
    ["refunding a delivered crown", () => actions.refundPayment(form({ paymentId: PAYMENT })), "request_manual_refund"],
    ["releasing a name", () => actions.releaseName(form({ name: "oldking" })), "release_profile_name"],
  ])("%s", async (_label, run, fn) => {
    await run();
    expect(rpc).toHaveBeenCalledWith(fn, expect.anything());
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it("changing a season's dates", async () => {
    await actions.saveSeasonDates(form({ seasonId: "1", startsAt: "2099-01-02T00:00", endsAt: "2099-01-20T00:00" }));
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["pausing the game", () => actions.setPaused(form({ paused: "true" }))],
    ["launching", () => actions.launchGame(form({ startsAt: "2099-01-01T00:00" }))],
  ])("%s", async (_label, run) => {
    await run();
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });
});
