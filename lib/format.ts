import type { Locale } from "@/i18n/routing";

// es-419 writes USD as "$34", like the design; generic "es" would write "34 $".
const NUMBER_LOCALE: Record<Locale, string> = { en: "en-US", es: "es-419" };

/** USD from integer cents: "$34" for whole dollars, "$34.50" otherwise. */
export function formatPrice(cents: number, locale: Locale): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Basis points as a percentage: 200 → "2%". */
export function formatPercent(bps: number, locale: Locale): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], { style: "percent", maximumFractionDigits: 2 }).format(bps / 10_000);
}

export type Units = { h: string; m: string; s: string };

/** Reign length as shown in lists: "38s", "47m", "3h 12m", "31h 07m". */
export function formatDuration(totalSeconds: number, units: Units): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}${units.s}`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}${units.m}`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds / 60) % 60;
  return `${h}${units.h} ${String(m).padStart(2, "0")}${units.m}`;
}

/** Live clock parts: hours unpadded, minutes and seconds padded. */
export function clockParts(totalSeconds: number): { h: string; m: string; s: string } {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return {
    h: String(Math.floor(seconds / 3600)),
    m: String(Math.floor(seconds / 60) % 60).padStart(2, "0"),
    s: String(seconds % 60).padStart(2, "0"),
  };
}

/** "4:59" for a lock countdown. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Whole days left, counting a started day as a day. */
export function daysLeft(endsAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 86_400_000));
}

/** "5h ago", "hace 5 h". */
export function formatAgo(from: string, now: number, locale: Locale): string {
  const seconds = Math.max(0, Math.round((now - new Date(from).getTime()) / 1000));
  const format = new Intl.RelativeTimeFormat(locale, { style: "narrow", numeric: "always" });
  if (seconds < 3600) return format.format(-Math.max(1, Math.floor(seconds / 60)), "minute");
  if (seconds < 86_400) return format.format(-Math.floor(seconds / 3600), "hour");
  return format.format(-Math.floor(seconds / 86_400), "day");
}

/** A link as text: no protocol, no "www.", no trailing slash. */
export function displayLink(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}
