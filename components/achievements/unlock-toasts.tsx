"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Icon, Portrait } from "@/components/art";
import { rarityColor } from "@/components/profile/parts";
import { RANK_STYLE } from "@/lib/art/frames";
import { MEDAL_KEY, type AchievementCode, isAchievementCode } from "@/lib/game/achievements";
import { RANKS, type Rank, isRank } from "@/lib/game/rank";
import { formatDuration } from "@/lib/format";
import type { Rarity } from "@/lib/profile/public";
import type { ViewerSummary } from "@/lib/profile/viewer";
import { DWELL, GAP, OUT, SEGMENTS, drainLeft, toastFrame } from "@/lib/achievements/toast-motion";
import { publicClient } from "@/lib/supabase/public";

const BOX = 72;

type Unlock =
  | { id: number; kind: "achievement"; code: AchievementCode; rarity: Rarity; seasonId: number | null }
  | { id: number; kind: "rank"; rank: Rank };

function Sparks({ step, color }: { step: number; color: string }) {
  if (!step) return null;
  const c = BOX / 2;
  const r = 36 + step * 6;
  return (
    <>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([dx, dy]) => (
        <span
          key={`${dx}${dy}`}
          aria-hidden
          className="absolute size-1.5"
          style={{ left: Math.round(c + dx * r * 0.7 - 3), top: Math.round(c + dy * r * 0.7 - 3), background: step === 3 ? "var(--crown-text)" : color }}
        />
      ))}
    </>
  );
}

function Toast({ unlock, viewer, season, onDone }: { unlock: Unlock; viewer: ViewerSummary; season: number; onDone: () => void }) {
  const t = useTranslations("achievement");
  const common = useTranslations("common");
  const medals = useTranslations("medals");
  const rankName = useTranslations("rank");
  const units = useTranslations("common.units");
  const locale = useLocale();
  const [time, setTime] = useState(0);
  const [copied, setCopied] = useState(false);
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const paused = useRef(false);
  const elapsed = useRef(0);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    const tick = (ts: number) => {
      const dt = last === null ? 0 : Math.min(100, ts - last);
      last = ts;
      const inDwell = elapsed.current > 600 && elapsed.current < DWELL;
      if (!(paused.current && inDwell)) elapsed.current += dt;
      if (elapsed.current >= DWELL + OUT) return done();
      setTime(elapsed.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const f = toastFrame(time, reduced);
  const color = unlock.kind === "achievement" ? rarityColor(unlock.rarity, unlock.seasonId) : RANK_STYLE[unlock.rank].swatch;
  const u = { h: units("h"), m: units("m"), s: units("s") };
  const name = unlock.kind === "achievement" ? medals(`${MEDAL_KEY[unlock.code]}.name`) : rankName(unlock.rank);
  const key = unlock.kind === "achievement" ? MEDAL_KEY[unlock.code] : null;
  const description =
    unlock.kind === "achievement"
      ? t(`items.${key}.1` as "items.owl.1")
      : t("rankDesc", { time: formatDuration(RANKS.find((r) => r.rank === unlock.rank)?.minSeconds ?? 0, u) });
  const label = unlock.kind === "achievement" ? t(`rar.${unlock.rarity === "seasonal" ? "seasonal" : unlock.rarity}`) : rankName(unlock.rank);
  const lit = drainLeft(time);
  const size = 24 * f.scale;

  const share = () => {
    const url = `${window.location.origin}/${locale}/u/${viewer.name.toLowerCase()}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
      data-testid="unlock-toast"
      className="pointer-events-auto fixed inset-x-3 bottom-3 z-50 bg-crown-velvet lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-100"
      style={{
        transform: `translateY(${f.ty}px)`,
        opacity: f.opacity,
        boxShadow: `inset 0 4px 0 ${color}, var(--crown-toast)`,
      }}
    >
      <div className="flex items-center gap-3.5 pt-4 pr-1 pb-3 pl-4 lg:gap-4 lg:pt-5 lg:pl-5">
        <div className="relative flex-none bg-crown-ink" style={{ width: BOX, height: BOX }}>
          {!reduced && <Sparks step={f.sparks} color={color} />}
          {f.scale > 0 &&
            (unlock.kind === "achievement" ? (
              // eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image
              <img
                src={`/art/medals/${key}-on.svg`}
                width={size}
                height={size}
                alt=""
                className="absolute block max-w-none [image-rendering:pixelated]"
                style={{ left: (BOX - size) / 2, top: (BOX - size) / 2 }}
              />
            ) : (
              <span className="absolute" style={{ left: (BOX - 44) / 2, top: (BOX - 44) / 2 }}>
                <Portrait avatar={viewer.avatar} rank={unlock.rank} season={season} crown={false} scale={1} />
              </span>
            ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5" style={{ opacity: f.textOpacity, transform: `translateX(${f.textX}px)` }}>
          <div className="text-12 text-crown-muted">{unlock.kind === "achievement" ? t("unlocked") : t("rankUp")}</div>
          <div className="text-18 leading-tight font-bold lg:text-20">{name}</div>
          <div className="flex">
            <div className="flex h-6 items-center gap-1.5 rounded-tag border border-crown-stone px-2">
              <span className="size-2" style={{ background: color }} />
              <span className="font-pixel text-12 font-medium">{label}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (elapsed.current < DWELL) elapsed.current = DWELL;
          }}
          aria-label={common("close")}
          className="hit-area flex size-11 flex-none items-center justify-center self-start hover:bg-crown-hall focus-visible:outline-offset-[-2px]"
        >
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 pb-3.5 lg:gap-4 lg:px-5 lg:pb-4" style={{ opacity: f.textOpacity }}>
        <div className="min-w-0 text-12 leading-snug text-crown-muted">{description}</div>
        <button
          type="button"
          onClick={share}
          className="hit-area m-1 flex h-10 flex-none items-center gap-2 bg-crown-hall px-3.5 text-14 font-bold shadow-relief-card hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-ink lg:px-4"
        >
          {copied && (
            <span className="flex size-3 items-center justify-center bg-crown-success text-crown-ink">
              <Icon name="check" size={8} height={6} />
            </span>
          )}
          {copied ? t("copied") : common("share")}
        </button>
      </div>
      <div className="flex gap-0.5 px-4 pb-3 lg:px-5 lg:pb-3.5" aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className="h-1 flex-1" style={{ background: i < lit ? color : "var(--crown-hall)" }} />
        ))}
      </div>
    </div>
  );
}

type AchievementInfo = { rarity: Rarity };

/**
 * Listens for the signed-in player's own unlocks (achievements and rank-ups) and shows them one
 * at a time. Other players' unlocks never reach this component: the channel filters by profile.
 */
export function UnlockToasts({ viewer, season }: { viewer: ViewerSummary; season: number }) {
  const [queue, setQueue] = useState<Unlock[]>([]);
  const [waiting, setWaiting] = useState(false);
  const rarities = useRef(new Map<string, AchievementInfo>());

  const receive = useEffectEvent((row: { id: number; kind: string; season_id: number | null; payload: unknown }) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    if (row.kind === "achievement_unlocked" && isAchievementCode(payload.code)) {
      const rarity = rarities.current.get(payload.code)?.rarity ?? "common";
      setQueue((q) => [...q, { id: row.id, kind: "achievement", code: payload.code as AchievementCode, rarity, seasonId: row.season_id }]);
    } else if (row.kind === "rank_up" && isRank(payload.rank)) {
      setQueue((q) => [...q, { id: row.id, kind: "rank", rank: payload.rank as Rank }]);
    }
  });

  useEffect(() => {
    const db = publicClient();
    void db
      .from("achievements")
      .select("code, rarity")
      .then(({ data }) => {
        for (const a of data ?? []) rarities.current.set(a.code, { rarity: a.rarity });
      });
    const channel = db
      .channel(`unlocks:${viewer.profileId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `profile_id=eq.${viewer.profileId}` },
        (change) => receive(change.new as { id: number; kind: string; season_id: number | null; payload: unknown }),
      )
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [viewer.profileId]);

  const current = waiting ? null : queue[0];
  if (!current) return null;
  return (
    <Toast
      key={current.id}
      unlock={current}
      viewer={viewer}
      season={season}
      onDone={() => {
        setQueue((q) => q.slice(1));
        setWaiting(true);
        setTimeout(() => setWaiting(false), GAP);
      }}
    />
  );
}
