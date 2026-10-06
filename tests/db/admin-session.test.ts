import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asRole, q, svc, uniqueEmail, withFreshGame } from "./helpers";

withFreshGame();

async function authUser(): Promise<string> {
  const id = randomUUID();
  await q("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [id, uniqueEmail("admin")]);
  return id;
}

async function session(userId: string, { ago = "1 minute", aal = "aal1", notAfter = null as string | null } = {}): Promise<string> {
  const id = randomUUID();
  await q(
    "insert into auth.sessions (id, user_id, created_at, updated_at, aal, not_after) values ($1, $2, now() - $3::interval, now(), $4::auth.aal_level, $5)",
    [id, userId, ago, aal, notAfter],
  );
  return id;
}

async function factor(userId: string, status: "verified" | "unverified", ago = "1 day"): Promise<string> {
  const id = randomUUID();
  await q(
    "insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at) values ($1, $2, 'totp', $3::auth.factor_status, now() - $4::interval, now())",
    [id, userId, status, ago],
  );
  return id;
}

type AdminSession = { signed_in_at: Date; aal: string; totp_factor_id: string | null };
const adminSession = (userId: string, sessionId: string) =>
  svc<AdminSession>("select * from admin_session($1, $2)", [userId, sessionId]);

describe("admin_session", () => {
  it("reports when this session signed in, its level and the verified TOTP factor", async () => {
    const user = await authUser();
    const sessionId = await session(user, { ago: "3 hours", aal: "aal2" });
    await factor(user, "unverified", "2 days");
    const verified = await factor(user, "verified");
    const [row] = await adminSession(user, sessionId);
    expect(row.aal).toBe("aal2");
    expect(row.totp_factor_id).toBe(verified);
    expect(Date.now() - row.signed_in_at.getTime()).toBeGreaterThan(3 * 3600_000 - 60_000);
  });

  it("dates the sign-in by this session, not by a newer sign-in elsewhere", async () => {
    const user = await authUser();
    const old = await session(user, { ago: "13 hours" });
    await session(user, { ago: "1 minute" });
    await q("update auth.users set last_sign_in_at = now() where id = $1", [user]);
    const [row] = await adminSession(user, old);
    expect(Date.now() - row.signed_in_at.getTime()).toBeGreaterThan(13 * 3600_000 - 60_000);
  });

  it("has no factor until one is verified", async () => {
    const user = await authUser();
    const sessionId = await session(user);
    await factor(user, "unverified");
    const [row] = await adminSession(user, sessionId);
    expect(row).toMatchObject({ aal: "aal1", totp_factor_id: null });
  });

  it("answers nothing for another user's session or an ended one", async () => {
    const user = await authUser();
    const other = await authUser();
    expect(await adminSession(other, await session(user))).toEqual([]);
    expect(await adminSession(user, await session(user, { notAfter: new Date(Date.now() - 1000).toISOString() }))).toEqual([]);
    expect(await adminSession(user, randomUUID())).toEqual([]);
  });

  it("cannot be called by clients", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(asRole(role, (c) => c.query("select * from admin_session(gen_random_uuid(), gen_random_uuid())"))).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it("starts with 12-hour admin sessions and 10-minute re-authentication", async () => {
    const [config] = await q<{ admin_session_seconds: number; admin_reauth_seconds: number }>(
      "select admin_session_seconds, admin_reauth_seconds from app_config",
    );
    expect(config).toEqual({ admin_session_seconds: 43_200, admin_reauth_seconds: 600 });
  });
});
