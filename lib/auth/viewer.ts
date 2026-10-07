import "server-only";
import type { User } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/service";
import { sessionClient } from "@/lib/supabase/session";

/** `lastSignInAt` comes from the auth server: when this user last signed in, not refreshed sessions. */
export type Viewer = { userId: string; email: string; profileId: string; lastSignInAt: string | null };

/**
 * A public-name suggestion from the provider profile: the X handle, else the display name with
 * accents dropped and spaces as underscores. The database keeps it only if it is valid and free.
 */
export function nameHint(user: Pick<User, "user_metadata">): string {
  const meta = user.user_metadata ?? {};
  const raw = [meta.preferred_username, meta.user_name, meta.full_name, meta.name].find(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

// Postgres foreign_key_violation: the auth user was deleted between checking the session and saving.
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Claims the guest profile bought with this email, or creates one (SPEC §4). Safe under concurrent
 * first requests. Null when the user has no email, or no longer exists (its session outlived it).
 */
export async function ensureProfile(user: User): Promise<string | null> {
  if (!user.email) return null;
  const { data, error } = await serviceClient().rpc("ensure_profile_for_user", {
    p_user_id: user.id,
    p_email: user.email,
    p_name_hint: nameHint(user),
  });
  if (error?.code === FOREIGN_KEY_VIOLATION) return null;
  if (error) throw new Error(`Could not resolve profile: ${error.message}`);
  return data;
}

type SessionClient = Awaited<ReturnType<typeof sessionClient>>;

/** Whether this session's verified sign-in methods include a password. Unreadable claims count as yes. */
async function signedInWithPassword(session: SessionClient): Promise<boolean> {
  const { data, error } = await session.auth.getClaims();
  if (error || !data) return true;
  const methods = (data.claims.amr ?? []).map((entry) => (typeof entry === "string" ? entry : entry.method));
  return methods.includes("password");
}

/** The signed-in player, with their profile, or null. */
export async function currentViewer(): Promise<Viewer | null> {
  const session = await sessionClient();
  // A session for a deleted user ends here (where cookies can be written); the player carries on signed out.
  const signOut = () => session.auth.signOut({ scope: "local" }).catch(() => undefined);
  const { data, error } = await session.auth.getUser();
  if (error?.code === "user_not_found") {
    await signOut();
    return null;
  }
  const user = data.user;
  if (!user?.email) return null;
  // The app never signs anyone in with a password: such a session comes from Supabase's open sign-up
  // API, by someone who may not own the email (decision 53).
  if (await signedInWithPassword(session)) {
    await signOut();
    return null;
  }
  const profileId = await ensureProfile(user);
  if (!profileId) {
    await signOut();
    return null;
  }
  return { userId: user.id, email: user.email, profileId, lastSignInAt: user.last_sign_in_at ?? null };
}
