import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Player, count, createLock, one, pay, q, service, svc, uniqueEmail, withFreshGame } from "./helpers";

withFreshGame();

async function createAuthUser(email: string): Promise<string> {
  const id = randomUUID();
  await q("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [id, email]);
  return id;
}

async function ensureProfile(userId: string, email: string, name = "Signed In"): Promise<string> {
  const rows = await svc<{ id: string }>("select ensure_profile_for_user($1, $2, $3) as id", [userId, email, name]);
  return rows[0].id;
}

describe("guest purchase", () => {
  it("creates a profile keyed by the lowercased email", async () => {
    const email = uniqueEmail("Guest").replace("guest", "GuEsT");
    const lock = await createLock({ email, name: "Guest.King", country: "AR" });
    expect(await pay(lock)).toBe("applied");

    const profile = await one<Record<string, unknown>>(
      "select p.*, pp.email, pp.locale, pp.alerts_dethroned from profiles p join profile_private pp on pp.profile_id = p.id",
    );
    expect(profile).toMatchObject({
      email: email.toLowerCase(),
      name: "Guest.King",
      country_code: "AR",
      user_id: null,
      locale: "en",
      alerts_dethroned: true,
    });
  });

  it("stores the buyer's locale", async () => {
    const lock = await createLock({ locale: "es" });
    await pay(lock);
    const row = await one<{ locale: string }>("select locale from profile_private");
    expect(row.locale).toBe("es");
  });

  it("reuses the profile for a repeat purchase with the same email in any case", async () => {
    const guest = new Player("guest");
    await guest.takeover();
    await new Player("other").takeover();
    await guest.takeover({ email: guest.email.toUpperCase() });

    expect(await count("profiles")).toBe(2);
    expect(await count("reigns", "profile_id = $1", [await guest.id()])).toBe(2);
  });

  it("does not create a profile for a refunded payment", async () => {
    const lock = await createLock();
    expect(await pay(lock, { amountCents: 1 })).toBe("refund_pending");
    expect(await count("profiles")).toBe(0);
  });

  it("credits a signed-in buyer's own profile", async () => {
    const email = uniqueEmail("member");
    const userId = await createAuthUser(email);
    const profileId = await ensureProfile(userId, email);
    const lock = await createLock({ email: uniqueEmail("checkout"), profileId });
    await pay(lock);
    const reign = await one<{ profile_id: string }>("select profile_id from reigns");
    expect(reign.profile_id).toBe(profileId);
    expect(await count("profiles")).toBe(1);
  });
});

describe("ensure_profile_for_user", () => {
  it("creates one profile when a new player's first requests arrive together", async () => {
    const email = uniqueEmail("burst");
    const userId = await createAuthUser(email);
    // The first call is mid-transaction (its profile not committed yet) when the second arrives.
    const first = await service.connect();
    try {
      await first.query("begin");
      const { rows } = await first.query<{ id: string }>("select ensure_profile_for_user($1, $2, 'Burst') as id", [userId, email]);
      const second = ensureProfile(userId, email);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await first.query("commit");
      expect(await second).toBe(rows[0].id);
    } finally {
      first.release();
    }
    const ids = await Promise.all(Array.from({ length: 8 }, () => ensureProfile(userId, email)));
    expect(new Set(ids).size).toBe(1);
    expect(await count("profiles", "user_id = $1", [userId])).toBe(1);
    expect(await count("profile_private", "profile_id = $1", [ids[0]])).toBe(1);
  });

  it("claims a guest profile once when the claims race", async () => {
    const guest = new Player("racing_guest");
    await guest.takeover();
    const userId = await createAuthUser(guest.email);
    const ids = await Promise.all(Array.from({ length: 6 }, () => ensureProfile(userId, guest.email)));
    expect(new Set(ids)).toEqual(new Set([await guest.id()]));
  });

  it("answers null for a session whose auth user no longer exists", async () => {
    const email = uniqueEmail("gone");
    expect(await ensureProfile(randomUUID(), email)).toBeNull();
    expect(await count("profile_private", "email = $1", [email])).toBe(0);
  });

  it("claims the guest profile bought with the same email", async () => {
    const guest = new Player("guest");
    await guest.takeover();
    const guestProfile = await guest.id();

    const userId = await createAuthUser(guest.email);
    const claimed = await ensureProfile(userId, guest.email.toUpperCase());

    expect(claimed).toBe(guestProfile);
    const profile = await one<{ user_id: string }>("select user_id from profiles where id = $1", [guestProfile]);
    expect(profile.user_id).toBe(userId);
    expect(await count("profiles")).toBe(1);
  });

  it("creates a profile for a new player", async () => {
    const email = uniqueEmail("fresh");
    const userId = await createAuthUser(email);
    const id = await ensureProfile(userId, email, "  Fresh Player  ");

    const profile = await one<Record<string, unknown>>(
      "select p.*, pp.email from profiles p join profile_private pp on pp.profile_id = p.id where p.id = $1",
      [id],
    );
    expect(profile).toMatchObject({ user_id: userId, name: "FreshPlayer", email });
  });

  it("falls back to a generated name", async () => {
    const email = uniqueEmail("blank");
    const id = await ensureProfile(await createAuthUser(email), email, "   ");
    const profile = await one<{ name: string }>("select name from profiles where id = $1", [id]);
    expect(profile.name).toMatch(/^king_[0-9a-f]{8}$/);
  });

  it("returns the same profile on every sign-in", async () => {
    const email = uniqueEmail("repeat");
    const userId = await createAuthUser(email);
    const first = await ensureProfile(userId, email);
    const second = await ensureProfile(userId, email);
    expect(second).toBe(first);
    expect(await count("profiles")).toBe(1);
  });

  it("does not claim a profile that already belongs to another account", async () => {
    const email = uniqueEmail("taken");
    const owner = await createAuthUser(email);
    await ensureProfile(owner, email);
    const intruder = await createAuthUser(uniqueEmail("intruder"));
    await expect(ensureProfile(intruder, email)).rejects.toThrow();
    const profile = await one<{ user_id: string }>("select user_id from profiles");
    expect(profile.user_id).toBe(owner);
  });

  it("keeps reigns won as a guest after claiming", async () => {
    const guest = new Player("guest");
    await guest.takeover();
    const userId = await createAuthUser(guest.email);
    const id = await ensureProfile(userId, guest.email);
    const stats = await one<{ crowns_taken: number }>("select crowns_taken from profile_stats where profile_id = $1", [id]);
    expect(stats.crowns_taken).toBe(1);
  });
});
