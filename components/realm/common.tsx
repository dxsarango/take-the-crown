"use client";

import { useLocale } from "next-intl";
import { useDisplayTimeZone } from "@/components/time-zone";
import type { Locale } from "@/i18n/routing";

export function useDates() {
  const locale = useLocale() as Locale;
  const tz = useDisplayTimeZone();
  const tag = locale === "es" ? "es-419" : "en-US";
  return {
    locale,
    day: (iso: string | number) => new Intl.DateTimeFormat(tag, { month: "short", day: "numeric", timeZone: tz }).format(new Date(iso)),
    date: (iso: string | number) =>
      new Intl.DateTimeFormat(tag, { month: "short", day: "numeric", year: "numeric", timeZone: tz }).format(new Date(iso)),
    time: (iso: string | number) =>
      new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date(iso)),
    dayKey: (iso: string | number) =>
      new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).format(new Date(iso)),
  };
}

/** Segmented control from the design system (inset relief on the active option). */
export function segmentClass(on: boolean): string {
  return on ? "bg-crown-hall text-crown-text shadow-inset-segment-on" : "text-crown-muted";
}
