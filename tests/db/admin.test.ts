import { describe, expect, it } from "vitest";
import { Player, asRole, createLock, currentReign, one, pay, q, svc, withFreshGame } from "./helpers";

withFreshGame();

async function kingWithMessage(): Promise<{ reignId: number; profileId: string }> {
  const player = new Player("herald");
  const reign = await player.takeover({ message: "Hello, realm" });
  return { reignId: reign.id, profileId: await player.id() };
}

async function admin(): Promise<string> {
  const player = new Player("admin");
  await player.takeover();
  const id = await player.id();
  await q("update profile_private set is_admin = true where profile_id = $1", [id]);
  return id;
}

describe("report_reign", () => {
  it("takes one report per IP per reign", async () => {
    const { reignId } = await kingWithMessage();
    const report = (ip: string) => svc<{ r: string }>("select report_reign($1, $2, 'spam') as r", [reignId, ip]);
    expect((await report("ip-a"))[0].r).toBe("created");
    expect((await report("ip-a"))[0].r).toBe("duplicate");
    expect((await report("ip-b"))[0].r).toBe("created");
    expect(await one("select count(*)::int as n from reports")).toEqual({ n: 2 });
  });

  it("ignores reigns without a visible message", async () => {
    const reign = await new Player("quiet").takeover({ message: null });
    expect(await one<{ r: string }>("select report_reign($1, 'ip', null) as r", [reign.id])).toEqual({ r: "not_found" });
    expect(await one<{ r: string }>("select report_reign(999999, 'ip', null) as r")).toEqual({ r: "not_found" });
  });

  it("only accepts the listed reasons", async () => {
    const { reignId } = await kingWithMessage();
    await expect(svc("select report_reign($1, 'ip', 'because')", [reignId])).rejects.toThrow(/reports_reason_check/);
  });
});

describe("admin actions", () => {
  it("hides a message, closes its reports and keeps a record", async () => {
    const adminId = await admin();
    const { reignId } = await kingWithMessage();
    await svc("select report_reign($1, 'ip', 'offensive')", [reignId]);
    await svc("select hide_reign_message($1, $2)", [reignId, adminId]);

    expect(await one("select message from public_reigns where id = $1", [reignId])).toEqual({ message: null });
    expect(await one("select resolved from reports where reign_id = $1", [reignId])).toEqual({ resolved: true });
    expect(await one("select action, target from admin_actions")).toEqual({ action: "hide_message", target: String(reignId) });
  });

  it("bans a player so they cannot lock the crown", async () => {
    const adminId = await admin();
    const { profileId } = await kingWithMessage();
    await new Player("next").takeover();
    await svc("select set_profile_banned($1, true, $2)", [profileId, adminId]);
    await expect(createLock({ profileId })).rejects.toThrow(/banned/);
    await svc("select set_profile_banned($1, false, $2)", [profileId, adminId]);
    await expect(createLock({ profileId })).resolves.toMatchObject({ status: "active" });
  });

  it("moves a payment to refund_pending once, and never a refunded one", async () => {
    const adminId = await admin();
    const lock = await createLock();
    await pay(lock, { providerPaymentId: "pay_manual" });
    const [payment] = await q<{ id: string }>("select id from payments where provider_payment_id = 'pay_manual'");
    const refunded = await one<{ status: string }>("select (request_manual_refund($1, $2)).status as status", [payment.id, adminId]);
    expect(refunded.status).toBe("refund_pending");
    await expect(svc("select request_manual_refund($1, $2)", [payment.id, adminId])).rejects.toThrow(/payment_not_refundable/);
    // The reign it paid for stays.
    expect(await currentReign()).not.toBeNull();
  });

  it("cannot be called by clients", async () => {
    for (const sql of [
      "select report_reign(1, 'x', null)",
      "select hide_reign_message(1, gen_random_uuid())",
      "select set_profile_banned(gen_random_uuid(), true, gen_random_uuid())",
      "select dismiss_report(1, gen_random_uuid())",
      "select request_manual_refund(gen_random_uuid(), gen_random_uuid())",
    ]) {
      await expect(asRole("anon", (c) => c.query(sql)), sql).rejects.toThrow(/permission denied/);
    }
    await expect(asRole("authenticated", (c) => c.query("select * from admin_actions"))).rejects.toThrow(/permission denied/);
  });
});
