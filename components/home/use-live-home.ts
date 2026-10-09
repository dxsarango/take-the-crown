"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HomeData } from "@/lib/home/data";
import { snapshotVersion } from "@/lib/home/snapshot";
import { publicClient } from "@/lib/supabase/public";

const REFETCH_DEBOUNCE_MS = 300;
/** While realtime is down (plan limit reached, network trouble), look again this often. */
const FALLBACK_REFRESH_MS = 30_000;

/**
 * Home data kept live: refetched whenever the crown changes or an event is published, and on
 * demand (`refresh`) when the page learns of a change some other way. The data comes from
 * /api/home, named by the change that was heard, so the CDN serves a crowd from one database read.
 */
export function useLiveHome(initial: HomeData): { data: HomeData; refresh: () => void } {
  const [data, setData] = useState(initial);
  const refetchRef = useRef<(commitTimestamp?: string) => void>(() => undefined);

  useEffect(() => {
    const db = publicClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest = 0;
    const refetch = (commitTimestamp?: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const request = ++latest;
        fetch(`/api/home?v=${encodeURIComponent(snapshotVersion(commitTimestamp, Date.now()))}`)
          .then((response) => (response.ok ? (response.json() as Promise<HomeData>) : Promise.reject(new Error(String(response.status)))))
          .then((next) => {
            if (request === latest) setData(next);
          })
          .catch(() => undefined);
      }, REFETCH_DEBOUNCE_MS);
    };
    refetchRef.current = refetch;

    let fallback: ReturnType<typeof setInterval> | undefined;
    const onChange = (change: { commit_timestamp?: string }) => refetch(change.commit_timestamp);
    const channel = db
      .channel("home")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crown_state" }, onChange)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, onChange)
      .subscribe((status) => {
        // Catch up on anything missed between the page render and the subscription.
        if (status === "SUBSCRIBED") {
          clearInterval(fallback);
          fallback = undefined;
          refetch();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // The snapshot route is cached at the edge, so many pages in this state cost one read.
          fallback ??= setInterval(() => {
            if (document.visibilityState === "visible") refetch();
          }, FALLBACK_REFRESH_MS);
        }
      });

    return () => {
      clearTimeout(timer);
      clearInterval(fallback);
      void db.removeChannel(channel);
    };
  }, []);

  const refresh = useCallback(() => refetchRef.current(), []);
  return { data, refresh };
}
