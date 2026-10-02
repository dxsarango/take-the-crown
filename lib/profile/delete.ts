import "server-only";
import { AVATAR_BUCKET, AVATAR_FILES } from "@/lib/profile/avatar";
import { serviceClient } from "@/lib/supabase/service";

/**
 * Deletes the player's account (privacy policy §8, terms §13): the database anonymizes the profile
 * and deletes its private data in one transaction, then the uploaded avatars and the sign-in user
 * go. Payment records stay for tax law. A failure after the database step is logged; the profile
 * is already anonymous and can no longer be signed into.
 */
export async function deleteAccount(profileId: string): Promise<boolean> {
  const db = serviceClient();
  const { data: userId, error } = await db.rpc("delete_profile", { p_profile_id: profileId });
  if (error) {
    console.error("delete_profile failed", error.message);
    return false;
  }

  const storage = db.storage.from(AVATAR_BUCKET);
  const { data: folders } = await storage.list(profileId, { limit: 1000 });
  const files = (folders ?? []).flatMap((folder) => Object.values(AVATAR_FILES).map((file) => `${profileId}/${folder.name}/${file}`));
  if (files.length) {
    const { error: removeError } = await storage.remove(files);
    if (removeError) console.error("avatar cleanup failed", profileId, removeError.message);
  }

  if (userId) {
    const { error: authError } = await db.auth.admin.deleteUser(userId);
    if (authError) console.error("auth user delete failed", profileId, authError.message);
  }
  return true;
}
