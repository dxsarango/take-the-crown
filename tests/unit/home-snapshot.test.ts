import { describe, expect, it, vi } from "vitest";
import { SNAPSHOT_WINDOW_MS, snapshotVersion, snapshotVersionSchema } from "@/lib/home/snapshot";

vi.mock("@/lib/supabase/public", () => ({ publicClient: () => ({}) }));
const fetchHomeData = vi.fn();
vi.mock("@/lib/home/data", () => ({ fetchHomeData: (...args: unknown[]) => fetchHomeData(...args) }));
const { GET } = await import("@/app/api/home/route");

const call = (query: string) => GET(new Request(`https://takethecrown.app/api/home${query}`));

describe("snapshotVersion", () => {
  it("names a change by its commit time, so everyone who heard it asks for the same snapshot", () => {
    const at = "2026-10-08T23:30:22.123456+00:00";
    expect(snapshotVersion(at, 1)).toBe(at);
    expect(snapshotVersion(at, 999_999)).toBe(at);
  });

  it("shares one snapshot per window when no change was heard", () => {
    const t = 1_700_000_000_000;
    expect(snapshotVersion(undefined, t)).toBe(snapshotVersion(undefined, t + 1000));
    expect(snapshotVersion(undefined, t)).not.toBe(snapshotVersion(undefined, t + SNAPSHOT_WINDOW_MS * 2));
  });

  it("falls back to the window for a timestamp it would not put in a URL", () => {
    expect(snapshotVersion("x".repeat(80), 5000)).toBe("w1");
    expect(snapshotVersion("a b", 5000)).toBe("w1");
  });

  it("accepts what it produces", () => {
    expect(snapshotVersionSchema.safeParse(snapshotVersion(undefined, Date.now())).success).toBe(true);
  });
});

describe("GET /api/home", () => {
  it("answers the home data, cached at the edge", async () => {
    fetchHomeData.mockResolvedValueOnce({ readAt: "now" });
    const response = await call("?v=w1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ readAt: "now" });
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=30");
  });

  it.each(["", "?v=", "?v=a%20b", `?v=${"x".repeat(41)}`, "?v=<script>"])("refuses %s without reading anything", async (query) => {
    fetchHomeData.mockClear();
    const response = await call(query);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchHomeData).not.toHaveBeenCalled();
  });

  it("never caches a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchHomeData.mockRejectedValueOnce(new Error("down"));
    const response = await call("?v=w2");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
