import { afterEach, describe, expect, it, vi } from "vitest";

const revalidateHome = vi.fn();
vi.mock("@/lib/home/cache", () => ({ revalidateHome: () => revalidateHome() }));

const { POST } = await import("@/app/api/e2e/revalidate/route");

describe("POST /api/e2e/revalidate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    revalidateHome.mockClear();
  });

  it("drops the cached public data locally, for e2e fixtures", () => {
    vi.stubEnv("VERCEL_ENV", "");
    expect(POST().status).toBe(204);
    expect(revalidateHome).toHaveBeenCalledTimes(1);
  });

  it.each(["production", "preview"])("does not exist on a %s deployment", (env) => {
    vi.stubEnv("VERCEL_ENV", env);
    expect(POST().status).toBe(404);
    expect(revalidateHome).not.toHaveBeenCalled();
  });
});
