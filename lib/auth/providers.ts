import "server-only";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import type { OAuthProvider } from "./next";

const settingsSchema = z.object({ external: z.record(z.string(), z.boolean()) });

/** Whether Supabase Auth has the provider switched on (checked before redirecting to it). */
export async function isProviderEnabled(provider: OAuthProvider): Promise<boolean> {
  try {
    const response = await fetch(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      next: { revalidate: 300 },
    });
    if (!response.ok) return false;
    return settingsSchema.parse(await response.json()).external[provider] === true;
  } catch {
    return false;
  }
}
