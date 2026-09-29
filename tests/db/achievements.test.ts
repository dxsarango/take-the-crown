import { describe, expect, it } from "vitest";
import {
  Player,
  achievementsOf,
  closeSeason,
  ageCurrentReign,
  count,
  one,
  q,
  svc,
  withFreshGame,
} from "./helpers";

withFreshGame();

const HOUR = 3600;

async function has(player: Player, code: string): Promise<boolean> {
  return (await achievementsOf(await player.id())).includes(code);
}

describe("award_takeover_achievements", () => {
  describe("first_blood", () => {
    it("goes to the first king of the season only", async () => {
      const first = new Player("first");
      const second = new Player("second");
      await first.takeover();
      await second.takeover();
      expect(await has(first, "first_blood")).toBe(true);
      expect(await has(second, "first_blood")).toBe(false);
    });

    it("is awarded again in the next season", async () => {
      await new Player("old").takeover();
      await closeSeason(0);
      await svc("select rollover_season()");
      const next = new Player("next");
      await next.takeover();
      expect(await has(next, "first_blood")).toBe(true);
    });
  });

  describe("regicide", () => {
    it("rewards dethroning a reign of 24 h or more", async () => {
      await new Player("long").takeover();
      await ageCurrentReign(24 * HOUR);
      const killer = new Player("killer");
      await killer.takeover();
      expect(await has(killer, "regicide")).toBe(true);
    });

    it("does not reward dethroning a shorter reign", async () => {
      await new Player("short").takeover();
      await ageCurrentReign(24 * HOUR - 60);
      const buyer = new Player("buyer");
      await buyer.takeover();
      expect(await has(buyer, "regicide")).toBe(false);
    });
  });

  describe("one_minute_king", () => {
    it("goes to a king dethroned in under 60 s", async () => {
      const quick = new Player("quick");
      await quick.takeover();
      await ageCurrentReign(59);
      const buyer = new Player("buyer");
      await buyer.takeover();
      expect(await has(quick, "one_minute_king")).toBe(true);
      expect(await has(buyer, "one_minute_king")).toBe(false);
    });

    it("does not go to a king who lasted a minute", async () => {
      const king = new Player("king");
      await king.takeover();
      await ageCurrentReign(60);
      await new Player("buyer").takeover();
      expect(await has(king, "one_minute_king")).toBe(false);
    });
  });

  describe("night_owl", () => {
    for (const [hour, expected] of [
      [2, false],
      [3, true],
      [4, true],
      [5, false],
    ] as const) {
      it(`${expected ? "is" : "is not"} awarded at local hour ${hour}`, async () => {
        const owl = new Player(`owl${hour}`);
        await owl.takeover({ localHour: hour });
        expect(await has(owl, "night_owl")).toBe(expected);
      });
    }

    it("is not awarded without a local hour", async () => {
      const owl = new Player("owl");
      await owl.takeover({ localHour: null });
      expect(await has(owl, "night_owl")).toBe(false);
    });
  });

  describe("revenge", () => {
    it("rewards dethroning whoever dethroned your last reign", async () => {
      const avenger = new Player("avenger");
      const rival = new Player("rival");
      await avenger.takeover();
      await rival.takeover();
      await avenger.takeover();
      expect(await has(avenger, "revenge")).toBe(true);
      expect(await has(rival, "revenge")).toBe(false);
    });

    it("is not awarded when someone else is on the throne", async () => {
      const avenger = new Player("avenger");
      await avenger.takeover();
      await new Player("rival").takeover();
      await new Player("other").takeover();
      await avenger.takeover();
      expect(await has(avenger, "revenge")).toBe(false);
    });
  });

  describe("guardian", () => {
    for (const [hours, expected] of [
      [11.9, []],
      [12, ["guardian_1"]],
      [24, ["guardian_1", "guardian_2"]],
      [72, ["guardian_1", "guardian_2", "guardian_3"]],
    ] as const) {
      it(`awards ${expected.join(", ") || "nothing"} for a ${hours} h reign when dethroned`, async () => {
        const king = new Player("king");
        await king.takeover();
        await ageCurrentReign(Math.round(hours * HOUR));
        await new Player("buyer").takeover();
        const guardians = (await achievementsOf(await king.id())).filter((code) => code.startsWith("guardian"));
        expect(guardians).toEqual(expected);
      });
    }

    it("is awarded live while the king still reigns", async () => {
      const king = new Player("king");
      await king.takeover();
      await ageCurrentReign(25 * HOUR);
      await svc("select check_live_achievements()");
      const guardians = (await achievementsOf(await king.id())).filter((code) => code.startsWith("guardian"));
      expect(guardians).toEqual(["guardian_1", "guardian_2"]);
    });

    it("does nothing live on an empty throne", async () => {
      await svc("select check_live_achievements()");
      expect(await count("profile_achievements")).toBe(0);
    });

    it("is not awarded twice", async () => {
      const king = new Player("king");
      await king.takeover();
      await ageCurrentReign(13 * HOUR);
      await svc("select check_live_achievements()");
      await svc("select check_live_achievements()");
      await new Player("buyer").takeover();
      expect(await count("profile_achievements", "achievement_code = 'guardian_1'")).toBe(1);
      expect(await count("events", "kind = 'achievement_unlocked' and payload->>'code' = 'guardian_1'")).toBe(1);
    });
  });

  describe("bargain_hunter", () => {
    it("is awarded at the floor price", async () => {
      const buyer = new Player("buyer");
      await buyer.takeover();
      expect(await has(buyer, "bargain_hunter")).toBe(true);
    });

    it("is not awarded above the floor", async () => {
      await new Player("first").takeover();
      const buyer = new Player("buyer");
      await buyer.takeover();
      expect(await has(buyer, "bargain_hunter")).toBe(false);
    });

    it("is awarded once the price decays back to the floor", async () => {
      await new Player("first").takeover();
      await q("update crown_state set base_set_at = now() - interval '200 hours'");
      const buyer = new Player("buyer");
      await buyer.takeover();
      expect(await has(buyer, "bargain_hunter")).toBe(true);
    });
  });

  describe("collector", () => {
    it("is awarded on the 10th crown", async () => {
      const collector = new Player("collector");
      const other = new Player("other");
      for (let i = 0; i < 9; i++) {
        await collector.takeover();
        await other.takeover();
      }
      expect(await has(collector, "collector")).toBe(false);
      await collector.takeover();
      expect(await has(collector, "collector")).toBe(true);
      expect(await has(other, "collector")).toBe(false);
    });
  });

  describe("rivalry", () => {
    it("goes to both players after 5 takeovers between them", async () => {
      const a = new Player("a");
      const b = new Player("b");
      await a.takeover();
      for (let i = 0; i < 4; i++) {
        await (i % 2 === 0 ? b : a).takeover();
      }
      expect(await has(a, "rivalry")).toBe(false);
      expect(await has(b, "rivalry")).toBe(false);
      await b.takeover();
      expect(await has(a, "rivalry")).toBe(true);
      expect(await has(b, "rivalry")).toBe(true);
    });

    it("does not count takeovers with other players", async () => {
      const a = new Player("a");
      const b = new Player("b");
      const c = new Player("c");
      for (let i = 0; i < 3; i++) {
        await a.takeover();
        await b.takeover();
        await c.takeover();
      }
      expect(await count("profile_achievements", "achievement_code = 'rivalry'")).toBe(0);
    });
  });

  describe("patriot", () => {
    it("goes to the first king ever from a country", async () => {
      const first = new Player("first", "EC");
      const second = new Player("second", "EC");
      const other = new Player("other", "PE");
      await first.takeover();
      await second.takeover();
      await other.takeover();
      expect(await has(first, "patriot")).toBe(true);
      expect(await has(second, "patriot")).toBe(false);
      expect(await has(other, "patriot")).toBe(true);
    });

    it("counts earlier seasons", async () => {
      await new Player("first", "EC").takeover();
      await closeSeason(0);
      await svc("select rollover_season()");
      const later = new Player("later", "EC");
      await later.takeover();
      expect(await has(later, "patriot")).toBe(false);
    });

    it("is not awarded without a country", async () => {
      const nobody = new Player("nobody", null);
      await nobody.takeover();
      expect(await has(nobody, "patriot")).toBe(false);
    });
  });

  describe("seasonal", () => {
    it("awards founder for reigning in Genesis", async () => {
      const king = new Player("king");
      await king.takeover();
      expect(await has(king, "founder")).toBe(true);
      expect(await has(king, "remembered")).toBe(false);
    });

    it("awards remembered for reigning in Day of the Dead", async () => {
      await closeSeason(0);
      await svc("select rollover_season()");
      const king = new Player("king");
      await king.takeover();
      expect(await has(king, "remembered")).toBe(true);
      expect(await has(king, "founder")).toBe(false);
    });

    it("skips seasons without an exclusive achievement", async () => {
      await q("update seasons set starts_at = now() - interval '1 day' where id = 2");
      await q("update crown_state set season_id = 2");
      const king = new Player("king");
      await king.takeover();
      expect(await achievementsOf(await king.id())).toEqual(["bargain_hunter", "first_blood", "patriot"]);
    });
  });

  describe("bookkeeping", () => {
    it("records the season where each achievement was earned", async () => {
      const king = new Player("king");
      await king.takeover();
      await closeSeason(0);
      await svc("select rollover_season()");
      await king.takeover();
      const rows = await q<{ achievement_code: string; season_id: number }>(
        "select achievement_code, season_id from profile_achievements where profile_id = $1",
        [await king.id()],
      );
      expect(rows.find((row) => row.achievement_code === "founder")?.season_id).toBe(0);
      expect(rows.find((row) => row.achievement_code === "remembered")?.season_id).toBe(1);
    });

    it("publishes an achievement_unlocked event per award", async () => {
      const king = new Player("king");
      await king.takeover();
      const awarded = await count("profile_achievements");
      expect(await count("events", "kind = 'achievement_unlocked'")).toBe(awarded);
    });

    it("skips inactive achievements", async () => {
      await q("update achievements set active = false where code = 'first_blood'");
      const king = new Player("king");
      await king.takeover();
      expect(await has(king, "first_blood")).toBe(false);
    });

    it("links the award to the reign that earned it", async () => {
      const king = new Player("king");
      const reign = await king.takeover();
      const row = await one<{ reign_id: number }>(
        "select reign_id from profile_achievements where achievement_code = 'first_blood'",
      );
      expect(row.reign_id).toBe(reign.id);
    });
  });
});
