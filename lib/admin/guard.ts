import "server-only";
import { currentViewer } from "@/lib/auth/viewer";
import { serviceClient } from "@/lib/supabase/service";

export type Admin = { profileId: string; email: string };

/** The signed-in player if profile_private.is_admin is set, else null (SPEC §13). */
export async function currentAdmin(): Promise<Admin | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  const { data } = await serviceClient().from("profile_private").select("is_admin").eq("profile_id", viewer.profileId).maybeSingle();
  return data?.is_admin ? { profileId: viewer.profileId, email: viewer.email } : null;
}
