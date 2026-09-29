import "server-only";

/**
 * Bot check before creating a lock. Cloudflare Turnstile plugs in here in M9; until then every
 * request passes. Returns false only when a token was required and failed.
 */
export async function verifyHuman(_token: string | null | undefined, _ip: string): Promise<boolean> {
  return true;
}
