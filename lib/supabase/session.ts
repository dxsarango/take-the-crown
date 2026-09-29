import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/** Anon client bound to the request's auth cookies, for reading the signed-in user and signing in. */
export async function sessionClient() {
  const store = await cookies();
  return createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components cannot set cookies; the proxy already refreshed the session.
        }
      },
    },
  });
}

/** The signed-in user's id and verified email, or null. */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  const db = await sessionClient();
  const { data } = await db.auth.getUser();
  return data.user?.email ? { id: data.user.id, email: data.user.email } : null;
}
