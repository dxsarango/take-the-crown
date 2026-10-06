import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/next";
import { sessionClient } from "@/lib/supabase/session";

/** Signs this device out (form POST from the account menu, edit profile or the admin) and returns to the given page. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return new Response(null, { status: 403 });
  const form = await request.formData().catch(() => null);
  const next = safeNext(typeof form?.get("next") === "string" ? String(form.get("next")) : null);
  const session = await sessionClient();
  // Other devices stay signed in. Supabase keeps the cookies when its API call fails, so they
  // are deleted here as well: the player is signed out on this device either way.
  await session.auth.signOut({ scope: "local" }).catch(() => undefined);
  const store = await cookies();
  for (const { name } of store.getAll()) if (name.startsWith("sb-")) store.delete(name);
  const response = NextResponse.redirect(new URL(next, url.origin), { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
