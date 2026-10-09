import type { BeforeSendEvent } from "@vercel/analytics/next";
import type { BeforeSendMiddleware } from "@vercel/speed-insights";

type VitalsEvent = Parameters<BeforeSendMiddleware>[0];

// Campaign tags: the one part of a query string worth keeping.
const CAMPAIGN = /^utm_(source|medium|campaign|term|content)$/;
// Pages that are only for the signed-in player or an admin are not measured.
const PRIVATE_PAGE = /^[/](en|es)[/](admin|settings|alerts)([/]|$)/;

/**
 * The address a measurement may carry: the page's path and its UTM campaign tags, without the
 * fragment and everything else a query string can hold (checkout ids, an email the payment provider
 * appends, sign-in redirects, share-card names). Private pages and unreadable addresses give null.
 */
function scrubUrl(address: string): string | null {
  try {
    const url = new URL(address);
    if (PRIVATE_PAGE.test(url.pathname)) return null;
    for (const key of [...url.searchParams.keys()]) if (!CAMPAIGN.test(key)) url.searchParams.delete(key);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * What Vercel Web Analytics may record for a page view: the scrubbed address (see scrubUrl).
 * Custom events are not sent at all: no event of ours carries data about a person.
 */
export function scrubAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;
  const url = scrubUrl(event.url);
  return url === null ? null : { ...event, url };
}

/**
 * What Vercel Speed Insights may record for a page load: the same scrubbed address. The route is
 * the page's template (/[locale]/u/[name]), never a value, so it stays.
 */
export function scrubVitalsEvent(event: VitalsEvent): VitalsEvent | null {
  if (event.type !== "vital") return null;
  const url = scrubUrl(event.url);
  return url === null ? null : { ...event, url };
}
