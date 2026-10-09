"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { scrubVitalsEvent } from "@/lib/analytics";

/** Vercel Speed Insights: cookieless Core Web Vitals from real visits, with the address scrubbed first (lib/analytics.ts). */
export function SpeedMeasurement() {
  return <SpeedInsights beforeSend={scrubVitalsEvent} />;
}
