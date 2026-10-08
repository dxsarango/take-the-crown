import "server-only";
import { serviceClient } from "@/lib/supabase/service";

export type LimitSetting =
  | "max_moderations_per_ip_per_hour"
  | "max_profile_saves_per_hour"
  | "max_magic_links_per_hour"
  | "max_avatar_uploads_per_hour"
  | "max_reports_per_ip_per_hour"
  | "max_name_checks_per_ip_per_hour";

/**
 * Counts one hit for `key` against an hourly limit from app_config and says whether it may go on.
 * Callers check this before anything expensive, like a moderation model call.
 */
export async function withinHourlyLimit(key: string, setting: LimitSetting): Promise<boolean> {
  const db = serviceClient();
  const { data: config, error: configError } = await db.from("app_config").select(setting).single();
  if (configError || !config) throw new Error(`Could not read ${setting}: ${configError?.message}`);
  const limit = (config as Record<LimitSetting, number>)[setting];
  const { data, error } = await db.rpc("take_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: 3600 });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  return data === true;
}
