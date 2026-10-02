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

/** Claims the guest profile bought with this email, or creates one (SPEC §4). */
export async function ensureProfile(user: User): Promise<string | null> {
  if (!user.email) return null;
  const { data, error } = await serviceClient().rpc("ensure_profile_for_user", {
    p_user_id: user.id,
    p_email: user.email,
    p_name_hint: nameHint(user),
  });
  if (error || !data) throw new Error(`Could not resolve profile: ${error?.message}`);
  return data;
}

/** The signed-in player, with their profile, or null. */
export async function currentViewer(): Promise<Viewer | null> {
  const session = await sessionClient();
  const { data } = await session.auth.getUser();
  const user = data.user;
  if (!user?.email) return null;
  const profileId = await ensureProfile(user);
  return profileId ? { userId: user.id, email: user.email, profileId, lastSignInAt: user.last_sign_in_at ?? null } : null;
}
