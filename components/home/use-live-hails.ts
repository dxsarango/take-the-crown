"use client";

import { useEffect, useState } from "react";
import { publicClient } from "@/lib/supabase/public";

// The page holds two panels (phone and desktop layouts), and a channel name is shared by topic: each
// subscription gets its own.
let subscriptions = 0;

/**
 * The hail count of one reign, kept live: the count arrives in the change itself (no page data to
 * refetch), and once subscribed the page reads it once, in case it changed since it was rendered.
 * `initial` is what the page was rendered with; the count never goes below it or what was heard.
 */
export function useLiveHails(reignId: number, initial: number): number {
  const [live, setLive] = useState(initial);

  useEffect(() => {
    const db = publicClient();
    const heard = (hails: number) => setLive((current) => Math.max(current, hails));
    const channel = db
      .channel(`hails-${reignId}-${++subscriptions}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reign_hail_counts", filter: `reign_id=eq.${reignId}` }, (change) => {
        const hails = (change.new as { hails?: unknown }).hails;
        if (typeof hails === "number") heard(hails);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        void db
          .from("reign_hail_counts")
          .select("hails")
          .eq("reign_id", reignId)
          .maybeSingle()
          .then(({ data }) => {
            if (data) heard(data.hails);
          });
      });
    return () => {
      void db.removeChannel(channel);
    };
  }, [reignId]);

  return Math.max(live, initial);
}
