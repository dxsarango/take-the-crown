import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Auth cookies only the server reads: the browser never talks to Supabase Auth (it reads public
 * data with the anon key), so a script on the page, injected or not, cannot read the session.
 */
export function sessionCookieOptions(https: boolean): CookieOptionsWithName {
  return { httpOnly: true, secure: https, sameSite: "lax", path: "/" };
}
