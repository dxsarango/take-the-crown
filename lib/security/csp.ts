/**
 * Content-Security-Policy for pages (SPEC §11). Scripts run only with this request's nonce
 * ('strict-dynamic' lets them load what they need, like Turnstile); the only third parties are
 * Cloudflare Turnstile and, from M10, the payment provider. Styles allow inline attributes because
 * React renders `style` props as attributes.
 */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export function contentSecurityPolicy(input: { nonce: string; supabaseUrl: string; dev: boolean; https: boolean }): string {
  const supabase = new URL(input.supabaseUrl);
  const realtime = `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${input.nonce}'`, "'strict-dynamic'", TURNSTILE_ORIGIN, ...(input.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabase.origin],
    "font-src": ["'self'"],
    "connect-src": ["'self'", supabase.origin, realtime, ...(input.dev ? ["ws:"] : [])],
    "frame-src": [TURNSTILE_ORIGIN],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "media-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (input.https) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** 128 random bits, base64. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
