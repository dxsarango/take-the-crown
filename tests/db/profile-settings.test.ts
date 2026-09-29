import { describe, expect, it } from "vitest";
import {
  Player,
  ageCurrentReign,
  closeSeason,
  count,
  createLock,
  one,
  q,
  svc,
  withFreshGame,
} from "./helpers";

withFreshGame();

async function newProfile(): Promise<string> {
  const player = new Player("settings");
  await player.takeover();
  return player.id();
}

describe("social links", () => {
  const cases: Record<string, { ok: string[]; bad: string[] }> = {
    link_website: {
      ok: ["https://ana.dev", "https://shop.example.co.uk/path?x=1"],
      bad: ["http://ana.dev", "https://localhost", "ana.dev", `https://a.dev/${"x".repeat(200)}`],
    },
    link_x: {
      ok: ["https://x.com/ana_codes"],
      bad: ["https://twitter.com/ana", "https://x.com/@ana", "https://x.com/way_too_long_handle", "https://x.com/ana/status/1"],
    },
    link_youtube: {
      ok: ["https://youtube.com/@ana.codes"],
      bad: ["https://youtube.com/ana", "https://www.youtube.com/@ana", "https://youtu.be/abc"],
    },
    link_tiktok: {
      ok: ["https://tiktok.com/@ana.codes"],
      bad: ["https://tiktok.com/ana", "https://www.tiktok.com/@ana"],
    },
    link_instagram: {
      ok: ["https://instagram.com/ana.codes"],
      bad: ["https://instagram.com/.ana", "https://instagram.com/ana..codes", "https://instagram.com/ana.", "https://instagr.am/ana"],
    },
    link_github: {
      ok: ["https://github.com/ana-codes", "https://github.com/a"],
      bad: ["https://github.com/-ana", "https://github.com/ana--codes", "https://github.com/ana-", `https://github.com/${"a".repeat(40)}`],
    },
    link_linkedin: {
      ok: ["https://linkedin.com/in/ana-codes"],
      bad: ["https://linkedin.com/company/acme", "https://www.linkedin.com/in/ana", "https://linkedin.com/in/ab"],
    },
    main_link: {
      ok: ["https://ana.dev/launch"],
      bad: ["http://ana.dev", "javascript:alert(1)"],
    },
  };

  for (const [column, { ok, bad }] of Object.entries(cases)) {
    it(`accepts only canonical ${column} values`, async () => {
      const id = await newProfile();
      for (const value of ok) {
        await expect(q(`update profiles set ${column} = $2 where id = $1`, [id, value]), value).resolves.toBeDefined();
      }
      for (const value of bad) {
        await expect(q(`update profiles set ${column} = $2 where id = $1`, [id, value]), value).rejects.toThrow(/check/);
      }
      await q(`update profiles set ${column} = null where id = $1`, [id]);
    });
  }

  it("requires https for the throne link", async () => {
    await expect(createLock({ link: "http://ana.dev" })).rejects.toThrow(/price_locks_link_format/);
    await expect(createLock({ link: "https://ana.dev" })).resolves.toMatchObject({ status: "active" });
  });
});

describe("privacy", () => {
  it("shows the rival and chronicle by default", async () => {
    const profile = await one("select show_rival, show_chronicle, show_total_spent from profiles where id = $1", [
      await newProfile(),
    ]);
    expect(profile).toEqual({ show_rival: true, show_chronicle: true, show_total_spent: false });
  });

  it("allows no country", async () => {
    const player = new Player("stateless", null);
    const reign = await player.takeover();
    expect(reign.country_code).toBeNull();
    expect(await one("select country_code from profiles where id = $1", [await player.id()])).toEqual({
      country_code: null,
    });
  });
});

describe("price-drop alerts", () => {
  async function watcher(thresholdCents: number | null): Promise<Player> {
    const player = new Player("watcher");
    await player.takeover();
    await q("update profile_private set alerts_price_below_cents = $2 where profile_id = $1", [
      await player.id(),
      thresholdCents,
    ]);
    return player;
  }

  async function queue(): Promise<number> {
    const [row] = await svc<{ n: number }>("select queue_price_alerts() as n");
    return row.n;
  }

  async function setPrice(cents: number): Promise<void> {
    await q("update crown_state set base_price_cents = $1, base_set_at = now()", [cents]);
  }

  it("alerts once when the price reaches the threshold", async () => {
    const player = await watcher(1000);
    await new Player("king").takeover();
    await setPrice(1200);
    expect(await queue()).toBe(0);

    await q("update crown_state set base_set_at = now() - interval '10 hours'");
    expect(await queue()).toBe(1);
    expect(await queue()).toBe(0);

    const notification = await one<{ kind: string; profile_id: string; payload: Record<string, unknown> }>(
      "select * from notifications where kind = 'price_drop'",
    );
    expect(notification.profile_id).toBe(await player.id());
    expect(notification.payload).toMatchObject({ threshold_cents: 1000, season_id: 0 });
    expect(Number(notification.payload.price_cents)).toBeLessThanOrEqual(1000);
  });

  it("alerts again after the crown changes hands", async () => {
    await watcher(10_000);
    await new Player("king").takeover();
    expect(await queue()).toBe(1);
    await new Player("next").takeover();
    expect(await queue()).toBe(1);
  });

  it("does not alert the current king", async () => {
    const player = await watcher(10_000);
    expect((await one<{ profile_id: string }>("select profile_id from reigns where ended_at is null")).profile_id).toBe(
      await player.id(),
    );
    expect(await queue()).toBe(0);
  });

  it("skips players without a threshold, banned players and closed seasons", async () => {
    await watcher(null);
    const banned = await watcher(10_000);
    await q("update profiles set is_banned = true where id = $1", [await banned.id()]);
    await new Player("king").takeover();
    expect(await queue()).toBe(0);

    await watcher(10_000);
    await new Player("king2").takeover();
    await q("update seasons set ends_at = now() - interval '1 second' where id = 0");
    expect(await queue()).toBe(0);
  });

  it("only accepts whole dollars up to $999", async () => {
    const player = await watcher(500);
    for (const bad of [550, 0, 100_000]) {
      await expect(
        q("update profile_private set alerts_price_below_cents = $2 where profile_id = $1", [await player.id(), bad]),
      ).rejects.toThrow(/check/);
    }
  });

  it("is scheduled every minute", async () => {
    expect(await count("cron.job", "jobname = 'price-alerts' and schedule = '* * * * *'")).toBe(1);
  });
});

describe("season-start alerts", () => {
  it("notifies players who asked when the next season starts", async () => {
    const reminded = new Player("reminded");
    await reminded.takeover();
    await q("update profile_private set alerts_season_start = true where profile_id = $1", [await reminded.id()]);
    await new Player("quiet").takeover();
    await ageCurrentReign(60);

    await closeSeason(0);
    await svc("select rollover_season()");

    const rows = await q<{ profile_id: string; payload: Record<string, unknown> }>(
      "select profile_id, payload from notifications where kind = 'season_started'",
    );
    expect(rows).toEqual([{ profile_id: await reminded.id(), payload: { season_id: 1, slug: "day-of-the-dead" } }]);
  });

  it("is off by default", async () => {
    const profile = await one("select alerts_season_start from profile_private where profile_id = $1", [
      await newProfile(),
    ]);
    expect(profile).toEqual({ alerts_season_start: false });
  });
});
