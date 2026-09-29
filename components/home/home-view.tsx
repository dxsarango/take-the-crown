"use client";

import { useEffect } from "react";
import { TopBar } from "@/components/top-bar";
import type { HomeData } from "@/lib/home/data";
import { heroState } from "@/lib/home/hero";
import { Hero, KingMessage } from "./hero";
import { Feed, Footer, HallOfFamePreview, Succession } from "./sections";
import { ThroneScene } from "./throne-scene";
import { useLiveHome, useServerNow } from "./use-live-home";

export function HomeView({ initial }: { initial: HomeData }) {
  const data = useLiveHome(initial);
  const now = useServerNow(initial.readAt);
  const season = data.season.id;
  const state = heroState(data.crown, data.king?.startedAt ?? null, now);

  // The server sets data-season on <html>; keep it in step when a season rolls over live.
  useEffect(() => {
    document.documentElement.dataset.season = String(season);
  }, [season]);

  return (
    <div className="flex min-h-dvh flex-col bg-crown-ink">
      <TopBar season={data.season} now={now} />
      <main className="flex-1">
        <ThroneScene season={season} king={data.king} locked={state.mode === "locked"} />
        <Hero king={data.king} crown={data.crown} state={state} season={season} />
        {data.king && (data.king.message || data.king.link) && (
          <div className="mx-4 flex flex-col gap-2.5 pt-4 pb-6 shadow-[var(--crown-bar-top)] lg:hidden">
            <KingMessage king={data.king} size="mobile" />
          </div>
        )}
        <div className="lg:px-18">
          <Succession reigns={data.succession} season={season} />
          <div className="mx-4 flex flex-col gap-6 py-6 shadow-[var(--crown-bar-top)] lg:mx-0 lg:grid lg:grid-cols-2 lg:items-start lg:gap-16 lg:pt-8 lg:pb-12">
            <HallOfFamePreview hall={data.hallOfFame} season={season} />
            <Feed items={data.feed} now={now} />
          </div>
        </div>
      </main>
      <Footer season={season} now={now} />
    </div>
  );
}
