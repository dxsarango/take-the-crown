import { beforeEach, describe, expect, it, vi } from "vitest";

let sameOrigin = true;
let rpcError: { message: string } | null = null;
let lockStatus: string | null = "active";
const rpc = vi.fn(async () => ({ error: rpcError }));
const revalidateHome = vi.fn();
vi.mock("@/lib/security/request", () => ({ sameOrigin: () => sameOrigin }));
vi.mock("@/lib/home/cache", () => ({ revalidateHome: () => revalidateHome() }));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: lockStatus ? { status: lockStatus } : null }) }) }) }),
  }),
}));

const { POST } = await import("@/app/api/locks/[id]/release/route");

const ID = "3f0f6d1e-6f59-4d6e-9a83-5d8a6c7c3a11";
const call = (id: string) => POST(new Request(`https://takethecrown.app/api/locks/${id}/release`, { method: "POST" }), { params: Promise.resolve({ id }) } as never);

describe("POST /api/locks/[id]/release", () => {
  beforeEach(() => {
    sameOrigin = true;
    rpcError = null;
    lockStatus = "active";
    rpc.mockClear();
    revalidateHome.mockClear();
  });

  it("frees the lock with one database call and answers 204", async () => {
    const response = await call(ID);
    expect(response.status).toBe(204);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("release_price_lock", { p_lock_id: ID });
  });

  it("answers only after the database call has finished", async () => {
    let finished = false;
    rpc.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      finished = true;
      return { error: null };
    });
    await call(ID);
    expect(finished).toBe(true);
  });

  it("refreshes the home's cached lock state when a held lock is released", async () => {
    await call(ID);
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it.each(["expired", "used", null])("leaves the cache alone for a lock that is %s", async (status) => {
    lockStatus = status;
    expect((await call(ID)).status).toBe(204);
    expect(revalidateHome).not.toHaveBeenCalled();
  });

  it("refuses another site without touching the database or the cache", async () => {
    sameOrigin = false;
    expect((await call(ID)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidateHome).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a uuid", async () => {
    expect((await call("not-a-lock")).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says so when the database fails, so the page does not think the crown is free", async () => {
    rpcError = { message: "down" };
    expect((await call(ID)).status).toBe(500);
    expect(revalidateHome).not.toHaveBeenCalled();
  });
});
