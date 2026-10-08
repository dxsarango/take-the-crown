import type { BeforeSendEvent } from "@vercel/analytics/next";

// Campaign tags: the one part of a query string worth keeping.
const CAMPAIGN = /^utm_(source|medium|campaign|term|content)$/;
// Pages that are only for the signed-in player or an admin are not measured.
const PRIVATE_PAGE = /^[/](en|es)[/](admin|settings|alerts)([/]|$)/;

/**
 * What Vercel Web Analytics may record for a page view. It keeps the page's path and its UTM
 * campaign tags, and drops everything else the address can carry (checkout ids, an email the
 * payment provider appends, sign-in redirects, share-card names) and the fragment. Private
 * pages and custom events are not sent at all: no event of ours carries data about a person.
 */
export function scrubAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;
  try {
    const url = new URL(event.url);
    if (PRIVATE_PAGE.test(url.pathname)) return null;
    for (const key of [...url.searchParams.keys()]) if (!CAMPAIGN.test(key)) url.searchParams.delete(key);
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}
