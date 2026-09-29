import "server-only";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

export type ServiceClient = SupabaseClient<Database>;

/** Service-role client: the only way the app writes. Never import it from client code. */
export function serviceClient(): ServiceClient {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
