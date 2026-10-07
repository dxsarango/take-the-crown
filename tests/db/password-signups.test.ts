import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asRole, one, q, svc, uniqueEmail, withFreshGame } from "./helpers";

withFreshGame();

/** A user registered through Supabase's sign-up API with a password someone else chose. */
async function userWithPassword(password: string): Promise<string> {
  const id = randomUUID();
  await q(
    "insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at) values ($1, $2, 'authenticated', 'authenticated', extensions.crypt($3, extensions.gen_salt('bf')), now())",
    [id, uniqueEmail("victim"), password],
  );
  return id;
}

async function sessionSignedInWith(userId: string, method: string): Promise<string> {
  const id = randomUUID();
  await q("insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, now(), now())", [id, userId]);
  await q("insert into auth.mfa_amr_claims (id, session_id, created_at, updated_at, authentication_method) values ($1, $2, now(), now(), $3)", [
    randomUUID(),
    id,
    method,
  ]);
  return id;
}

const passwordStillWorks = async (userId: string, password: string) =>
  (await one<{ ok: boolean }>("select encrypted_password = extensions.crypt($2, encrypted_password) as ok from auth.users where id = $1", [userId, password])).ok;

describe("forget_password_access", () => {
  it("replaces the password and ends the sessions opened with it, keeping the owner's", async () => {
    const user = await userWithPassword("attacker-chose-this");
    const attacker = await sessionSignedInWith(user, "password");
    const owner = await sessionSignedInWith(user, "otp");
    expect(await passwordStillWorks(user, "attacker-chose-this")).toBe(true);

    const [{ ended }] = await svc<{ ended: number }>("select forget_password_access($1) as ended", [user]);

    expect(ended).toBe(1);
    expect(await passwordStillWorks(user, "attacker-chose-this")).toBe(false);
    const sessions = await q<{ id: string }>("select id from auth.sessions where user_id = $1", [user]);
    expect(sessions.map((s) => s.id)).toEqual([owner]);
    expect(attacker).not.toBe(owner);
  });

  it("does nothing harmful for a player who never had a known password", async () => {
    const user = await userWithPassword(randomUUID());
    const owner = await sessionSignedInWith(user, "oauth");
    const [{ ended }] = await svc<{ ended: number }>("select forget_password_access($1) as ended", [user]);
    expect(ended).toBe(0);
    expect(await q("select id from auth.sessions where user_id = $1", [user])).toEqual([{ id: owner }]);
  });

  it("cannot be called by clients", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(asRole(role, (c) => c.query("select forget_password_access(gen_random_uuid())"))).rejects.toThrow(/permission denied/);
    }
  });
});
