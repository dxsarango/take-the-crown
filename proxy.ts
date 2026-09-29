import { type CookieOptions, createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { publicEnv } from "./lib/env";

const intl = createMiddleware(routing);

/**
 * Locale routing, plus the Supabase session refresh: server components cannot write cookies, so a
 * rotated access token is written here, on the request (for this render) and on the response.
 */
export default async function proxy(request: NextRequest) {
  const refreshed: { name: string; value: string; options: CookieOptions }[] = [];

  if (request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) {
    const supabase = createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const cookie of list) {
            request.cookies.set(cookie.name, cookie.value);
            refreshed.push(cookie);
          }
        },
      },
    });
    await supabase.auth.getUser();
  }

  const response = intl(request);
  for (const { name, value, options } of refreshed) response.cookies.set(name, value, options);
  return response;
}

export const config = {
  matcher: "/((?!api|auth|art|og|avatar|_next|_vercel|.*\\..*).*)",
};
