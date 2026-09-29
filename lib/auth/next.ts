/** Where to go after signing in: same-site paths only, never "//evil.example" or "/\evil.example". */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/** Adds a query parameter to a same-site path. */
export function withParam(path: string, key: string, value: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

export const OAUTH_PROVIDERS = ["google", "x"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** Why sign-in bounced back to the page, shown in the login dialog. */
export const AUTH_ERRORS = ["failed", "no_email", "unavailable"] as const;
export type AuthError = (typeof AUTH_ERRORS)[number];

export function isAuthError(value: string | null): value is AuthError {
  return value !== null && (AUTH_ERRORS as readonly string[]).includes(value);
}
