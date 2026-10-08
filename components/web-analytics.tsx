"use client";

import { Analytics } from "@vercel/analytics/next";
import { scrubAnalyticsEvent } from "@/lib/analytics";

/** Vercel Web Analytics: cookieless page views, with the address scrubbed first (lib/analytics.ts). */
export function WebAnalytics() {
  return <Analytics beforeSend={scrubAnalyticsEvent} />;
}
