import { bearerMatches } from "./bearer";

/**
 * Where to send a request that did not come in through the site's own domain, or null to serve it.
 * The `*.vercel.app` domains reach the same deployment without Cloudflare (its WAF, rate limit
 * rule and origin secret), so everything is sent to the canonical domain. Vercel Cron calls the
 * deployment directly and cannot follow a redirect to a domain it did not ask for, so a cron route
 * with the right CRON_SECRET is served on any host.
 */
export function canonicalRedirect(input: {
  url: URL;
  host: string | null;
  authorization: string | null;
  siteUrl: string;
  cronSecret: string | undefined;
}): string | null {
  const site = new URL(input.siteUrl);
  if (input.host?.toLowerCase() === site.host) return null;
  const isCron = input.url.pathname.startsWith("/api/cron/");
  if (isCron && bearerMatches(input.authorization, input.cronSecret)) return null;
  return `${site.origin}${input.url.pathname}${input.url.search}`;
}

/**
 * Only the live site enforces it: `next dev` is reached by whatever name the developer uses, and
 * preview deployments sit behind Vercel's own protection on their own address.
 */
export function enforcesCanonicalHost(env: { NODE_ENV?: string; VERCEL_ENV?: string }): boolean {
  return env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview";
}
