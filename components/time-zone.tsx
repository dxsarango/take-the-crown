"use client";

import { type ReactNode, createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { TIME_ZONE_COOKIE } from "@/lib/time-zone";

const ServerTimeZone = createContext<string | null>(null);
const noop = () => () => undefined;

/** The zone the server rendered times in, from the reader's cookie (null on a first visit). */
export function TimeZoneProvider({ timeZone, children }: { timeZone: string | null; children: ReactNode }) {
  return <ServerTimeZone.Provider value={timeZone}>{children}</ServerTimeZone.Provider>;
}

/**
 * The time zone to format with. The server render and hydration use the cookie's zone (UTC on a
 * first visit); afterwards the browser's own. With the cookie set, both are the same zone, so
 * returning readers never see times switch.
 */
export function useDisplayTimeZone(): string | undefined {
  const server = useContext(ServerTimeZone);
  const client = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return client ? undefined : (server ?? "UTC");
}

/** Remembers the browser's time zone for the next server render. */
export function TimeZoneCookie() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie.split("; ").find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`));
    if (current?.slice(TIME_ZONE_COOKIE.length + 1) === encodeURIComponent(zone)) return;
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return null;
}
