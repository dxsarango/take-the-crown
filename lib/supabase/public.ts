import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

export type PublicClient = SupabaseClient<Database>;

let browserClient: PublicClient | null = null;

/** Anonymous client for public tables and views. Safe on the server and in the browser. */
export function publicClient(): PublicClient {
  const create = () =>
    createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  if (typeof window === "undefined") return create();
  browserClient ??= create();
  return browserClient;
}
