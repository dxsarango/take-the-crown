"use client";

import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/routing";

const noop = () => () => undefined;

/**
 * True once running in the browser. Times are formatted in UTC for the server render and switch to
 * the reader's time zone after hydration, so the two renders never disagree.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function useDates() {
  const locale = useLocale() as Locale;
  const client = useIsClient();
  const tz = client ? undefined : "UTC";
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
