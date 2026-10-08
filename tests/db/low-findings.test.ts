import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Player, count, one, q, svc, uniqueEmail, withFreshGame } from "./helpers";

withFreshGame();

/** A signed-in player: an auth user linked to their profile, with `sessions` open sessions. */
async function signedIn(label: string, sessions = 2): Promise<{ profileId: string; userId: string }> {
  const player = new Player(label);
  await player.takeover();
  const profileId = await player.id();
  const userId = randomUUID();
  await q("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [userId, uniqueEmail("auth")]);
  await q("update profiles set user_id = $2 where id = $1", [profileId, userId]);
  for (let i = 0; i < sessions; i++) {
    await q("insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, now(), now())", [randomUUID(), userId]);
  }
  return { profileId, userId };
}

const sessionsOf = (userId: string) => count("auth.sessions", "user_id = $1", [userId]);

describe("suspension ends sessions (L5)", () => {
  it("signs the account out everywhere when it is suspended", async () => {
    const { profileId, userId } = await signedIn("banned");
    expect(await sessionsOf(userId)).toBe(2);
    await q("update profiles set is_banned = true where id = $1", [profileId]);
    expect(await sessionsOf(userId)).toBe(0);
  });

  it("leaves other accounts' sessions alone", async () => {
    const banned = await signedIn("banned");
    const other = await signedIn("other");
    await q("update profiles set is_banned = true where id = $1", [banned.profileId]);
    expect(await sessionsOf(other.userId)).toBe(2);
  });

  it("does not touch sessions on other profile updates or when lifting the suspension", async () => {
    const { profileId, userId } = await signedIn("bystander");
    await q("update profiles set updated_at = now() where id = $1", [profileId]);
    expect(await sessionsOf(userId)).toBe(2);
    await q("update profiles set is_banned = true where id = $1", [profileId]);
    await q("update profiles set is_banned = false where id = $1", [profileId]);
    await q("insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, now(), now())", [randomUUID(), userId]);
    await q("update profiles set is_banned = false where id = $1", [profileId]);
    expect(await sessionsOf(userId)).toBe(1);
  });

  it("suspends a profile without an auth user (a guest buyer)", async () => {
    const player = new Player("guest");
    await player.takeover();
    await q("update profiles set is_banned = true where id = $1", [await player.id()]);
    expect(await one("select is_banned from profiles where id = $1", [await player.id()])).toEqual({ is_banned: true });
  });

  it("cannot be called by clients or the service role", async () => {
    await expect(svc("select end_sessions_of_suspended_profile()")).rejects.toThrow(/permission denied|trigger/i);
  });
});

describe("statement timeout (L4)", () => {
  it("is set for the service role, longer than for the client roles", async () => {
    const rows = await q<{ rolname: string; rolconfig: string[] | null }>(
      "select rolname, rolconfig from pg_roles where rolname in ('anon', 'authenticated', 'service_role')",
    );
    const seconds = Object.fromEntries(
      rows.map((r) => [r.rolname, Number(/statement_timeout=(\d+)s/.exec((r.rolconfig ?? []).join(","))?.[1] ?? 0)]),
    );
    expect(seconds.service_role).toBeGreaterThan(0);
    expect(seconds.service_role).toBeGreaterThan(seconds.authenticated);
    expect(seconds.service_role).toBeLessThanOrEqual(60);
  });
});

describe("name check limit (L2)", () => {
  it("is a bounded setting in app_config", async () => {
    const { max_name_checks_per_ip_per_hour: limit } = await one<{ max_name_checks_per_ip_per_hour: number }>(
      "select max_name_checks_per_ip_per_hour from app_config",
    );
    expect(limit).toBeGreaterThanOrEqual(100);
    await expect(q("update app_config set max_name_checks_per_ip_per_hour = 0")).rejects.toThrow(/check/);
    await expect(q("update app_config set max_name_checks_per_ip_per_hour = 10001")).rejects.toThrow(/check/);
  });
});
