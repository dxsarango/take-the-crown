"use client";

import { useEffect, useRef, useState } from "react";
import { type HomeData, fetchHomeData } from "@/lib/home/data";
import { clockOffset } from "@/lib/home/hero";
import { publicClient } from "@/lib/supabase/public";

const REFETCH_DEBOUNCE_MS = 300;

/**
 * Server-corrected clock (SPEC §6). The first render uses the time the data was read, so the
 * server HTML and the first client render match; then it ticks every second.
 */
export function useServerNow(initial: string): number {
  const [now, setNow] = useState(() => new Date(initial).getTime());
  const offset = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const sentAt = Date.now();
    fetch("/api/time", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ now: number }>)
      .then(({ now: serverNow }) => {
        if (!cancelled) offset.current = clockOffset(sentAt, Date.now(), serverNow);
      })
      .catch(() => undefined);

    const tick = () => setNow(Date.now() + offset.current);
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return now;
}

/** Home data kept live: refetched whenever the crown changes or an event is published. */
export function useLiveHome(initial: HomeData): HomeData {
  const [data, setData] = useState(initial);

  useEffect(() => {
    const db = publicClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest = 0;
    const refetch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const request = ++latest;
        fetchHomeData(db)
          .then((next) => {
            if (request === latest) setData(next);
          })
          .catch(() => undefined);
      }, REFETCH_DEBOUNCE_MS);
    };

    const channel = db
      .channel("home")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crown_state" }, refetch)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, refetch)
      .subscribe((status) => {
        // Catch up on anything missed between the page render and the subscription.
        if (status === "SUBSCRIBED") refetch();
      });

    return () => {
      clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, []);

  return data;
}
