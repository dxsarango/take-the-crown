import { describe, expect, it } from "vitest";
import { Player, achievementsOf, ageCurrentReign, closeSeason, createLock, one, pay, q, svc, withFreshGame } from "./helpers";

withFreshGame();

const providerPaymentId = async (reignId: number) =>
  (await one<{ id: string }>("select p.provider_payment_id as id from payments p join reigns r on r.payment_id = p.id where r.id = $1", [reignId])).id;
const refund = async (reignId: number) => svc("select mark_payment_refunded('test', $1)", [await providerPaymentId(reignId)]);
const dispute = async (reignId: number, status: string) =>
  (await svc<{ result: string }>("select record_payment_dispute('test', $1, $2) as result", [await providerPaymentId(reignId), status]))[0].result;
const reign = (id: number) =>
  one<{ reversed_at: Date | null; reversal_kind: string | null; end_reason: string | null; message_hidden: boolean }>(
    "select reversed_at, reversal_kind, end_reason, message_hidden from reigns where id = $1",
    [id],
  );

describe("refund of a delivered crown", () => {
  it("takes the throne back and keeps the reign in history, marked and without message or link", async () => {
    const king = new Player("king");
    const crowned = await king.takeover({ message: "Hello realm", link: "https://king.example" });
    expect(await achievementsOf(await king.id())).toContain("first_blood");

    await refund(crowned.id);

    expect(await reign(crowned.id)).toMatchObject({ reversal_kind: "refund", end_reason: "reversed", message_hidden: true });
    expect(await one("select current_reign_id from crown_state")).toEqual({ current_reign_id: null });
    expect(await one("select message, link, reversed from public_reigns where id = $1", [crowned.id])).toEqual({ message: null, link: null, reversed: true });
    expect(await one("select status from payments p join reigns r on r.payment_id = p.id where r.id = $1", [crowned.id])).toEqual({ status: "refunded" });
    // Achievements earned through it are gone; stats and leaderboards ignore it.
    expect(await achievementsOf(await king.id())).toEqual([]);
    expect(await one("select crowns_taken, total_reign_seconds from profile_stats where profile_id = $1", [await king.id()])).toEqual({
      crowns_taken: 0,
      total_reign_seconds: 0,
    });
    expect(await q("select 1 from season_leaderboard where profile_id = $1", [await king.id()])).toEqual([]);
    expect(await q("select 1 from season_stats")).toEqual([]);
  });

  it("drops ranks the player no longer reaches and keeps the ones other reigns earned", async () => {
    const player = new Player("ranked");
    const first = await player.takeover();
    await ageCurrentReign(2 * 3600);
    await new Player("taker").takeover();
    const second = await player.takeover();
    await ageCurrentReign(7 * 3600);
    await new Player("taker2").takeover();
    await svc("select record_rank_ups($1)", [await player.id()]);
    expect((await q<{ rank: string }>("select rank from rank_ups where profile_id = $1 order by reached_at", [await player.id()])).map((r) => r.rank)).toEqual(
      expect.arrayContaining(["knight", "baron"]),
    );

    await refund(second.id);

    const ranks = (await q<{ rank: string }>("select rank from rank_ups where profile_id = $1", [await player.id()])).map((r) => r.rank);
    expect(ranks).toEqual(["knight"]);
    expect((await reign(first.id)).reversed_at).toBeNull();
  });

  it("gives a closed season its King of the Season again without the reversed reign", async () => {
    const big = new Player("big");
    const bigReign = await big.takeover();
    await ageCurrentReign(10 * 3600);
    const small = new Player("small");
    await small.takeover();
    await ageCurrentReign(3600);
    await closeSeason(0);
    await svc("select rollover_season()");
    expect(await one("select king_profile_id from seasons where id = 0")).toEqual({ king_profile_id: await big.id() });

    await refund(bigReign.id);
    expect(await one("select king_profile_id from seasons where id = 0")).toEqual({ king_profile_id: await small.id() });
  });

  it("does not let a reversed reign block achievements for later players", async () => {
    const first = new Player("first", "EC");
    const firstReign = await first.takeover();
    await new Player("other", "AR").takeover();
    await refund(firstReign.id);
    const second = new Player("second", "EC");
    await second.takeover();
    expect(await achievementsOf(await second.id())).toContain("patriot");
  });

  it("is idempotent", async () => {
    const crowned = await new Player("twice").takeover();
    await refund(crowned.id);
    const before = await reign(crowned.id);
    await refund(crowned.id);
    expect(await reign(crowned.id)).toEqual(before);
  });
});

describe("refund before delivery", () => {
  it("only marks the payment refunded: there is no reign to reverse", async () => {
    await new Player("king").takeover();
    const lock = await createLock();
    await q("update price_locks set expires_at = now() - interval '1 day' where id = $1", [lock.id]);
    await q("update crown_state set active_lock_id = null, active_lock_expires_at = null");
    expect(await pay(lock)).toBe("refund_pending");
    const [payment] = await q<{ provider_payment_id: string }>("select provider_payment_id from payments where lock_id = $1", [lock.id]);

    await svc("select mark_payment_refunded('test', $1)", [payment.provider_payment_id]);

    expect(await one("select status from payments where lock_id = $1", [lock.id])).toEqual({ status: "refunded" });
    expect(await q("select 1 from reigns where reversed_at is not null")).toEqual([]);
    expect((await one<{ current_reign_id: number | null }>("select current_reign_id from crown_state")).current_reign_id).not.toBeNull();
  });
});

describe("chargebacks", () => {
  it("reverses the reign and suspends the account when a dispute opens", async () => {
    const buyer = new Player("disputer");
    const crowned = await buyer.takeover();
    await new Player("next").takeover();

    expect(await dispute(crowned.id, "dispute_opened")).toBe("reversed");

    expect(await reign(crowned.id)).toMatchObject({ reversal_kind: "chargeback", message_hidden: true });
    expect(await one("select is_banned from profiles where id = $1", [await buyer.id()])).toEqual({ is_banned: true });
    expect(await one("select dispute_status from payments p join reigns r on r.payment_id = p.id where r.id = $1", [crowned.id])).toEqual({
      dispute_status: "dispute_opened",
    });
  });

  it("upgrades an earlier refund to a chargeback", async () => {
    const crowned = await new Player("refunded").takeover();
    await refund(crowned.id);
    await dispute(crowned.id, "dispute_lost");
    expect((await reign(crowned.id)).reversal_kind).toBe("chargeback");
  });

  it("only records the other dispute statuses, and ignores unknown payments", async () => {
    const buyer = new Player("challenged");
    const crowned = await buyer.takeover();
    for (const status of ["dispute_challenged", "dispute_won", "dispute_cancelled", "dispute_expired"]) {
      expect(await dispute(crowned.id, status)).toBe("recorded");
    }
    expect((await reign(crowned.id)).reversed_at).toBeNull();
    expect(await one("select is_banned from profiles where id = $1", [await buyer.id()])).toEqual({ is_banned: false });
    expect((await svc<{ result: string }>("select record_payment_dispute('test', 'nope', 'dispute_lost') as result"))[0].result).toBe("unknown_payment");
  });
});
