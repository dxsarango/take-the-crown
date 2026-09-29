import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/next";
import { sessionClient } from "@/lib/supabase/session";

/** Signs out (form POST from edit profile) and returns to the given page. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return new Response(null, { status: 403 });
  const form = await request.formData().catch(() => null);
  const next = safeNext(typeof form?.get("next") === "string" ? String(form.get("next")) : null);
  const session = await sessionClient();
  await session.auth.signOut();
  return NextResponse.redirect(new URL(next, url.origin), { status: 303 });
}
