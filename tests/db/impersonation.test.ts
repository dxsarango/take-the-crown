import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Player, count, createLock, one, pay, q, svc, uniqueEmail, withFreshGame } from "./helpers";

withFreshGame();

async function claim(player: Player): Promise<string> {
  const userId = randomUUID();
  await q("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [
    userId,
    player.email,
  ]);
  await svc("select ensure_profile_for_user($1, $2, $3)", [userId, player.email, "x"]);
  return userId;
}

describe("known emails", () => {
  for (const claimed of [false, true]) {
    it(`never lets a guest take the crown with a ${claimed ? "claimed" : "guest"} profile's email`, async () => {
      const victim = new Player("victim");
      await victim.takeover();
      await new Player("other").takeover();
      if (claimed) await claim(victim);
      const victimId = await victim.id();
      const reignsBefore = await count("reigns", "profile_id = $1", [victimId]);

      for (const email of [victim.email, victim.email.toUpperCase()]) {
        await expect(createLock({ email, name: "Impostor" })).rejects.toThrow("email_verification_required");
      }
      expect(await count("price_locks", "lower(email) = lower($1)", [victim.email])).toBe(1);
      expect(await count("reigns", "profile_id = $1", [victimId])).toBe(reignsBefore);
      const state = await one<{ is_locked: boolean }>("select is_locked from public_crown_state");
      expect(state.is_locked).toBe(false);
    });
  }

  it("gives the same error for claimed and unclaimed profiles", async () => {
    const unclaimed = new Player("unclaimed");
    const claimed = new Player("claimed");
    await unclaimed.takeover();
    await claimed.takeover();
    await new Player("other").takeover();
    await claim(claimed);

    const errors = await Promise.all(
      [unclaimed, claimed].map((p) => createLock({ email: p.email }).then(() => "no error", (e: Error) => e.message)),
    );
    expect(errors[0]).toBe(errors[1]);
  });

  it("refunds a guest payment whose email gained a profile after the lock", async () => {
    const email = uniqueEmail("race");
    const lock = await createLock({ email, name: "Race.Guest" });
    // Someone signs up with that email before the guest's payment arrives.
    const userId = randomUUID();
    await q("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [userId, email]);
    const [owner] = await svc<{ id: string }>("select ensure_profile_for_user($1, $2, 'Owner') as id", [userId, email]);

    expect(await pay(lock)).toBe("refund_pending");
    expect(await count("reigns", "profile_id = $1", [owner.id])).toBe(0);
    expect(await count("reigns")).toBe(0);
  });

  it("lets the signed-in owner of the email buy", async () => {
    const player = new Player("owner");
    await player.takeover();
    await new Player("other").takeover();
    await claim(player);
    const lock = await createLock({ email: player.email, profileId: await player.id() });
    expect(await pay(lock)).toBe("applied");
    expect(await count("reigns", "profile_id = $1", [await player.id()])).toBe(2);
  });
});
