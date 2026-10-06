import "server-only";
import { within } from "@/lib/auth/reauth";
import { currentViewer } from "@/lib/auth/viewer";
import { serviceClient } from "@/lib/supabase/service";
import { sessionClient } from "@/lib/supabase/session";

export type Admin = { userId: string; profileId: string; email: string };

/**
 * Where an admin's session stands (decision 49): signed in too long ago for /admin, without a
 * TOTP factor yet, with one but not verified in this session, or admitted. `recent` says whether
 * the sign-in is fresh enough for sensitive actions.
 */
export type AdminAccess = { admin: Admin; limits: { sessionSeconds: number; reauthSeconds: number } } & (
  | { state: "stale" }
  | { state: "enroll" }
  | { state: "verify"; factorId: string }
  | { state: "ok"; recent: boolean }
);

/** The signed-in player if profile_private.is_admin is set, else null (SPEC §13). Says nothing about the session. */
export async function currentAdmin(): Promise<Admin | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  const { data } = await serviceClient().from("profile_private").select("is_admin").eq("profile_id", viewer.profileId).maybeSingle();
  return data?.is_admin ? { userId: viewer.userId, profileId: viewer.profileId, email: viewer.email } : null;
}

/** The admin's access for /admin and its actions, or null for everyone else. */
export async function adminAccess(): Promise<AdminAccess | null> {
  const admin = await currentAdmin();
  if (!admin) return null;
  const { data: verified } = await (await sessionClient()).auth.getClaims();
  const sessionId = verified?.claims.session_id;
  const db = serviceClient();
  const [{ data: config, error }, session] = await Promise.all([
    db.from("app_config").select("admin_session_seconds, admin_reauth_seconds").single(),
    typeof sessionId === "string"
      ? db.rpc("admin_session", { p_user_id: admin.userId, p_session_id: sessionId }).then(({ data }) => data?.[0] ?? null)
      : null,
  ]);
  if (error || !config) throw new Error(`Could not read the admin session settings: ${error?.message}`);

  const base = { admin, limits: { sessionSeconds: config.admin_session_seconds, reauthSeconds: config.admin_reauth_seconds } };
  if (!session || !within(session.signed_in_at, config.admin_session_seconds)) return { ...base, state: "stale" };
  if (!session.totp_factor_id) return { ...base, state: "enroll" };
  if (session.aal !== "aal2") return { ...base, state: "verify", factorId: session.totp_factor_id };
  return { ...base, state: "ok", recent: within(session.signed_in_at, config.admin_reauth_seconds) };
}
