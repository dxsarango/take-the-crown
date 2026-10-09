"use client";

import { useEffect, useRef, useState } from "react";
import { clockOffset } from "@/lib/home/hero";

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
