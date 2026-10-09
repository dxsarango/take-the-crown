import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateHome = vi.fn();
let verdicts: { verdict: string; reason?: string }[] = [];
const rpc = vi.fn(async () => ({ error: null }));
const pending = [{ id: 1, name: "king", message: "hello", link: null }];

vi.mock("@/lib/security/cron", () => ({ cronAuthorized: () => true }));
vi.mock("@/lib/home/cache", () => ({ revalidateHome: () => revalidateHome() }));
vi.mock("@/lib/moderation", () => ({ moderate: async () => verdicts.shift() }));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => {
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) builder[m] = () => builder;
    builder.limit = async () => ({ data: pending, error: null });
    return { rpc, from: () => builder };
  },
}));

const { GET } = await import("@/app/api/cron/moderation/route");
const run = () => GET(new Request("https://takethecrown.app/api/cron/moderation"));

describe("moderation retries drop the cached public pages when content is settled", () => {
  beforeEach(() => revalidateHome.mockClear());

  it("when held content is approved", async () => {
    verdicts = [{ verdict: "allow" }];
    await run();
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it("when held content is rejected", async () => {
    verdicts = [{ verdict: "reject", reason: "hate" }];
    await run();
    expect(rpc).toHaveBeenCalledWith("settle_reign_moderation", expect.objectContaining({ p_approved: false }));
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it("not while the model is still unavailable", async () => {
    verdicts = [{ verdict: "unavailable" }];
    await run();
    expect(revalidateHome).not.toHaveBeenCalled();
  });
});
