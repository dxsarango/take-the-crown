import { beforeEach, describe, expect, it, vi } from "vitest";

let answer: { error: { message: string } | null } = { error: null };
let throws = false;
vi.mock("@/lib/supabase/public", () => ({
  publicClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        abortSignal: () => chain,
        single: async () => {
          if (throws) throw new Error("fetch failed");
          return { data: answer.error ? null : { id: true }, ...answer };
        },
      };
      return chain;
    },
  }),
}));

const { GET } = await import("@/app/api/health/route");

describe("GET /api/health", () => {
  beforeEach(() => {
    answer = { error: null };
    throws = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("answers 200 ok, uncached, when the database answers", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 with nothing else when the database fails or is unreachable", async () => {
    answer = { error: { message: "relation does not exist" } };
    const failed = await GET();
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ ok: false });
    throws = true;
    expect((await GET()).status).toBe(503);
  });
});
