"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type HomeData, fetchHomeData } from "@/lib/home/data";
import { publicClient } from "@/lib/supabase/public";

const REFETCH_DEBOUNCE_MS = 300;

/**
 * Home data kept live: refetched whenever the crown changes or an event is published, and on
 * demand (`refresh`) when the page learns of a change some other way.
 */
export function useLiveHome(initial: HomeData): { data: HomeData; refresh: () => void } {
  const [data, setData] = useState(initial);
  const refetchRef = useRef<() => void>(() => undefined);

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
    refetchRef.current = refetch;

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

  const refresh = useCallback(() => refetchRef.current(), []);
  return { data, refresh };
}
