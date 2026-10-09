import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A stand-in for Next's data cache: keeps resolved values per key and arguments, never rejections.
type Registered = { key: string; revalidate: number | false | undefined; tags: string[] };
const registered: Registered[] = [];
const store = new Map<string, unknown>();
const reads = new Map<string, number>();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: vi.fn(),
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>, keys: string[], opts: { revalidate?: number | false; tags?: string[] }) => {
    registered.push({ key: keys.join("/"), revalidate: opts.revalidate, tags: opts.tags ?? [] });
    return async (...args: A): Promise<R> => {
      reads.set(keys.join("/"), (reads.get(keys.join("/")) ?? 0) + 1);
      const id = JSON.stringify([keys, args]);
      if (store.has(id)) return store.get(id) as R;
      const value = await fn(...args);
      store.set(id, value);
      return value;
    };
  },
}));

// React's cache() memoizes for one server request; `newRequest()` starts the next one.
let request = new Map<unknown, Map<string, unknown>>();
const newRequest = () => (request = new Map());
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    return (...args: A): R => {
      const memo = request.get(fn) ?? new Map<string, unknown>();
      request.set(fn, memo);
      const id = JSON.stringify(args);
      if (!memo.has(id)) memo.set(id, fn(...args));
      return memo.get(id) as R;
    };
  },
}));

const PROFILE_ID = "5b1e2f3a-4c5d-4e6f-8a7b-9c0d1e2f3a4b";
let resolves: string | null = PROFILE_ID;
const profileIdForName = vi.fn(async () => resolves);
const fetchProfilePage = vi.fn(async () => ({
  name: "king",
  readAt: "2026-01-01T00:00:00.000Z",
  joinedAt: "2026-01-01T00:00:00.000Z",
  avatar: { image: null },
  socials: [],
  mainLink: null,
  stats: { crowns: 2, totalSeconds: 60 },
}));
const banCheck = vi.fn(async () => ({ data: { is_banned: false }, error: null }));
const profileCard = vi.fn(async () => null);

vi.mock("@/lib/profile/public", () => ({ profileIdForName, fetchProfilePage }));
vi.mock("@/lib/home/data", () => ({ fetchHomeData: vi.fn() }));
vi.mock("@/lib/realm/data", () => ({ fetchSeasons: vi.fn(), fetchHallOfFame: vi.fn(), fetchHistoryPage: vi.fn(), fetchSeasonEnd: vi.fn(), fetchSeasonSummary: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ publicClient: () => ({}) }));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: banCheck }) }) }) }),
}));
vi.mock("@/lib/og/metadata", () => ({ profileCard, seasonCard: vi.fn(), shareMetadata: () => ({}) }));
vi.mock("@/lib/auth/viewer", () => ({ currentViewer: async () => null }));
vi.mock("@/lib/time-zone.server", () => ({ readerTimeZone: async () => "UTC" }));
vi.mock("@/lib/site", () => ({ siteUrl: () => "https://takethecrown.app" }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => () => "", setRequestLocale: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ permanentRedirect: vi.fn() }));
vi.mock("@/components/profile/profile-view", () => ({ ProfileView: () => null }));
vi.mock("@/components/json-ld", () => ({ JsonLdScript: () => null }));
vi.mock("@/components/time-zone", () => ({ TimeZoneProvider: () => null }));

const { HOME_TAG, PUBLIC_DATA_SECONDS, revalidateHome } = await import("@/lib/home/cache");
const { cachedProfileCard, cachedProfileId } = await import("@/lib/profile/cache");
await import("@/lib/realm/cache");
const page = await import("@/app/[locale]/u/[name]/page");

const props = { params: Promise.resolve({ locale: "en", name: "king" }), searchParams: Promise.resolve({}) } as never;

beforeEach(() => {
  store.clear();
  reads.clear();
  newRequest();
  resolves = PROFILE_ID;
  for (const spy of [profileIdForName, fetchProfilePage, banCheck, profileCard, revalidateTag]) spy.mockClear();
});

describe("cached public data", () => {
  it.each(["profile-id-for-name", "profile-page", "profile-card", "kingdom", "season-end", "season-share", "home-data", "seasons"])(
    "%s is tagged for invalidation and lives at most 30 s",
    (key) => {
      const cache = registered.find((r) => r.key === key);
      expect(cache?.tags).toContain(HOME_TAG);
      expect(cache?.revalidate).toBeGreaterThanOrEqual(10);
      expect(cache?.revalidate).toBeLessThanOrEqual(30);
    },
  );

  // Rollover and achievements earned while reigning happen in pg_cron, where the app cannot hear them.
  it("shows changes made inside the database within 10 s", () => {
    expect(PUBLIC_DATA_SECONDS).toBe(10);
    for (const key of ["profile-id-for-name", "profile-page", "profile-card", "kingdom", "season-end", "season-share", "seasons"]) {
      expect(registered.find((r) => r.key === key)?.revalidate).toBe(PUBLIC_DATA_SECONDS);
    }
  });

  it("revalidateHome drops every tagged entry at once", () => {
    revalidateHome();
    expect(revalidateTag).toHaveBeenCalledWith(HOME_TAG, { expire: 0 });
  });

  it("does not cache an unknown name, so a name claimed a moment later resolves", async () => {
    resolves = null;
    expect(await cachedProfileId("newcomer")).toBeNull();
    newRequest();
    resolves = PROFILE_ID;
    expect(await cachedProfileId("newcomer")).toBe(PROFILE_ID);
  });

  it("shares one entry for every ?card= that is not an achievement or a rank", async () => {
    await cachedProfileCard(PROFILE_ID, "nonsense");
    await cachedProfileCard(PROFILE_ID, undefined);
    await cachedProfileCard(PROFILE_ID, ["a", "b"]);
    expect(profileCard).toHaveBeenCalledTimes(1);
    expect(profileCard).toHaveBeenCalledWith({}, PROFILE_ID, undefined);
  });
});

describe("profile page", () => {
  it("looks the name up and checks the ban once per request, for the metadata and the body", async () => {
    await page.generateMetadata(props);
    await page.default(props);
    expect(reads.get("profile-id-for-name")).toBe(1);
    expect(reads.get("profile-page")).toBe(1);
    expect(profileIdForName).toHaveBeenCalledTimes(1);
    expect(banCheck).toHaveBeenCalledTimes(1);
  });

  it("counts live durations from the request, not from when the data was cached", async () => {
    const before = Date.now();
    const element = (await page.default(props)) as { props: { children: unknown[] } };
    const view = element.props.children.flat().find((c) => (c as { props?: { data?: unknown } })?.props?.data) as { props: { data: { readAt: string } } };
    expect(new Date(view.props.data.readAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});
