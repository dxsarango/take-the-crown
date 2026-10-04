"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Flag, Icon } from "@/components/art";
import { useAuth } from "@/components/auth/auth-provider";
import { Footer } from "@/components/home/sections";
import { useServerNow } from "@/components/home/use-live-home";
import { TopBar } from "@/components/top-bar";
import { Link } from "@/i18n/navigation";
import { formatClock, formatDuration, formatDurationPrecise, formatPrice } from "@/lib/format";
import { MEDAL_KEY, isAchievementCode } from "@/lib/game/achievements";
import type { SeasonEnd, SeasonInfo, SeasonRecord } from "@/lib/realm/data";
import { useDates } from "./common";
import { Banner, Podium } from "./podium";
import { usePlayerName } from "@/components/player-name";
import { isFormerName, profileHref } from "@/lib/game/former";
import { artSet } from "@/lib/art/seasons";

/** Next-season announcement art by art set; seasons without their own art announce with Genesis. */
const NEXT_SCENE: Record<number, string> = { 0: "t0", 1: "t1", 2: "t2-provisional" };

type Props = { data: SeasonEnd; current: SeasonInfo; readAt: string };

export function SeasonView({ data, current, readAt }: Props) {
  const nameOf = usePlayerName();
  const t = useTranslations("realm");
  const seasonT = useTranslations("season");
  const rank = useTranslations("rank");
  const medals = useTranslations("medals");
  const profile = useTranslations("profile");
  const units = useTranslations("common.units");
  const u = { h: units("h"), m: units("m"), s: units("s") };
  const now = useServerNow(readAt);
  const { day, date, locale } = useDates();
  const { viewer, openLogin } = useAuth();
  const [reminded, setReminded] = useState(false);
  const [copied, setCopied] = useState(false);
  const { season, next, king, ended, summary } = data;
  const n = season.id;
  const seasonName = seasonT("title", { n, name: season.name[locale] });
  // ends_at is exclusive: the last day shown is the day before.
  const dates = t("dates", { from: day(season.startsAt), to: date(new Date(season.endsAt).getTime() - 1) });
  const title = ended ? t("ended", { season: seasonName }) : t("inProgress", { season: seasonName });
  const hours = (s: number) => `${Math.floor(s / 3600)}${u.h}`;

  const remind = async () => {
    if (!viewer) return openLogin({});
    const response = await fetch("/api/profile/remind", { method: "POST" }).catch(() => null);
    if (response?.ok) setReminded(true);
  };
  const share = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const kosStats = king
    ? [
        { l: t("kosStats.0"), v: String(king.crowns) },
        { l: t("kosStats.1"), v: formatDuration(king.longestSeconds, u) },
        { l: t("kosStats.2"), v: rank(king.rank) },
      ]
    : [];
  const who = (r: SeasonRecord | null) => (r?.who ? nameOf(r.who.name) : null);
  const stats: { l: string; v: string; who?: string | null; gold?: boolean }[] = [
    { l: t("st.0"), v: String(summary.reigns) },
    { l: t("st.1"), v: String(summary.kings) },
    { l: t("st.2"), v: String(summary.countries) },
    { l: t("st.3"), v: data.longest ? formatDuration(data.longest.value, u) : "—", who: who(data.longest) },
    { l: t("st.4"), v: data.shortest ? formatDurationPrecise(data.shortest.value, u) : "—", who: who(data.shortest) },
    {
      l: t("st.5"),
      v: data.peak ? formatPrice(data.peak.value, locale) : "—",
      who: data.peak?.who && data.peak.at ? t("paidBy", { name: nameOf(data.peak.who.name), date: day(data.peak.at) }) : null,
      gold: true,
    },
  ];

  const kosTag = (size: "mobile" | "desktop") => (
    <div
      className={`flex items-center rounded-tag border border-crown-gold font-pixel font-medium text-crown-gold ${
        size === "mobile" ? "h-7 px-2.5 text-14" : "h-8 px-3 text-16"
      }`}
    >
      {ended ? t("kos") : t("leading")}
    </div>
  );

  const nextStart = next ? new Date(next.startsAt).getTime() : null;
  const counting = nextStart !== null && nextStart > now;
  const medalCode = data.medalCode && isAchievementCode(data.medalCode) ? data.medalCode : null;
  const frame = season.exclusiveFrame === "genesis" ? "genesis" : season.exclusiveFrame === "day-of-the-dead" ? "marigold" : null;
  const keep =
    medalCode && frame && summary.kings > 0
      ? t("keep", { count: summary.kings, n, medal: medals(`${MEDAL_KEY[medalCode]}.name`), frame: t(`frameNames.${frame}`) })
      : null;

  const nextActions = (
    <>
      {counting &&
        (reminded ? (
          <p role="status" className="flex items-center gap-2 text-14 font-bold">
            <span className="flex size-4 flex-none items-center justify-center bg-crown-success text-crown-ink">
              <Icon name="check" size={8} height={6} />
            </span>
            {t("reminded")}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void remind()}
            className="hit-area m-1 h-13 bg-crown-hall px-6 text-16 font-bold shadow-relief-card hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-ink"
          >
            {t("remind")}
          </button>
        ))}
      {!counting && (
        <Link
          href="/"
          className="hit-area m-1 flex h-13 items-center justify-center bg-crown-hall px-6 text-16 font-bold shadow-relief-card hover:bg-crown-stone focus-visible:outline-offset-[6px]"
        >
          {t("goThrone")}
        </Link>
      )}
      <button
        type="button"
        onClick={share}
        className="hit-area h-11 px-3 text-14 font-bold underline decoration-crown-stone decoration-2 underline-offset-[6px] hover:bg-crown-velvet"
      >
        <span aria-live="polite">{copied ? profile("copied") : t("shareSeason")}</span>
      </button>
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-crown-ink">
      <TopBar season={current} now={now} />
      <main className="flex-1">
        {/* King of the Season */}
        <section className="bg-crown-velvet">
          <div className="flex flex-col items-center gap-5 px-4 pt-7 pb-6 text-center lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-center lg:gap-18 lg:px-18 lg:py-14 lg:text-left">
            <div className="flex flex-col items-center gap-1.5 lg:hidden">
              <div className="text-14 text-crown-muted">{dates}</div>
              <h1 className="text-28 leading-[1.15] font-bold">{title}</h1>
            </div>
            {king && (
              <>
                <span className="lg:hidden">
                  <Banner person={king} season={n} scale={4} />
                </span>
                <span className="hidden lg:block">
                  <Banner person={king} season={n} scale={6} />
                </span>
              </>
            )}
            <div className="flex flex-col items-center gap-2.5 lg:items-start lg:gap-5">
              <div className="hidden flex-col gap-1.5 lg:flex">
                <div className="text-16 text-crown-muted">{dates}</div>
                <h1 className="text-40 leading-tight font-bold">{title}</h1>
              </div>
              {king ? (
                <>
                  <div className="lg:hidden">{kosTag("mobile")}</div>
                  <div className="hidden lg:block">{kosTag("desktop")}</div>
                  <div className="flex items-center gap-2.5 lg:gap-3.5">
                    {isFormerName(king.name) ? (
                      <span className="text-28 font-bold lg:text-64 lg:leading-none lg:tracking-[-0.02em]">{nameOf(king.name)}</span>
                    ) : (
                      <Link href={`/u/${king.name.toLowerCase()}`} className="text-28 font-bold hover:underline lg:text-64 lg:leading-none lg:tracking-[-0.02em]">
                        {king.name}
                      </Link>
                    )}
                    <Flag code={king.countryCode} className="lg:hidden" />
                    <Flag code={king.countryCode} scale={3} className="hidden lg:block" />
                  </div>
                  <div className="flex flex-col items-center gap-2.5 lg:flex-row lg:items-baseline lg:gap-4">
                    <div className="font-pixel text-40 leading-none font-bold lg:text-64">{formatDuration(king.seconds, u)}</div>
                    <div className="text-14 text-crown-muted lg:text-16">{ended ? t("kosSub") : t("leadingSub")}</div>
                  </div>
                  {ended && <p className="hidden max-w-160 text-20 leading-snug font-medium text-pretty text-crown-muted lg:block">{t("kosLine", { name: king.name, time: formatDuration(king.seconds, u), crowns: king.crowns })}</p>}
                  <div className="mt-1 grid w-full grid-cols-3 gap-1 lg:flex lg:w-auto">
                    {kosStats.map((s) => (
                      <div key={s.l} className="flex min-w-0 flex-col gap-1.5 bg-crown-ink px-2 py-3 lg:w-45 lg:gap-2 lg:p-4">
                        <div className="font-pixel text-18 leading-none font-bold [overflow-wrap:anywhere] lg:order-2 lg:text-28">{s.v}</div>
                        <div className="text-12 text-crown-muted lg:order-1">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-14 text-crown-muted">{seasonT("firstKing", { n })}</p>
              )}
            </div>
          </div>
        </section>

        {/* Podium and numbers */}
        <div className="flex flex-col lg:grid lg:grid-cols-[520px_minmax(0,1fr)] lg:items-end lg:gap-18 lg:px-18 lg:py-14">
          <section className="flex flex-col gap-4 px-4 pt-7 lg:gap-5 lg:p-0">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-20 font-bold lg:text-28">{t("podiumT")}</h2>
              <div className="text-12 text-crown-muted lg:text-14">{t("podiumSub", { n })}</div>
            </div>
            <Podium
              season={n}
              spots={data.podium.map((p) => ({ key: p.profileId, value: hours(p.seconds), name: nameOf(p.name), href: profileHref(p.name), person: p }))}
            />
          </section>
          <section className="flex flex-col gap-3.5 px-4 py-7 lg:gap-5 lg:p-0">
            <h2 className="text-20 font-bold lg:text-28">{ended ? t("seasonStats", { n }) : t("soFar", { n })}</h2>
            <div className="grid grid-cols-2 gap-1 lg:grid-cols-3">
              {stats.map((s) => (
                <div key={s.l} className="flex flex-col gap-2 bg-crown-velvet p-3.5 lg:gap-2.5 lg:p-5">
                  <div className="text-12 text-crown-muted">{s.l}</div>
                  <div className={`font-pixel text-28 leading-none font-bold lg:text-40 ${s.gold ? "text-crown-gold" : ""}`}>{s.v}</div>
                  {s.who && <div className="text-12 text-crown-muted lg:text-14">{s.who}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Next season */}
        {next && NEXT_SCENE[artSet(next.id)] && (
          <section className="shadow-[var(--crown-bar-top)]">
            <div className="flex justify-center overflow-hidden bg-crown-abyss">
              {/* eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image */}
              <img src={`/art/scenes/${NEXT_SCENE[artSet(next.id)]}/98x72-empty.svg`} width={392} height={288} alt="" className="block max-w-none [image-rendering:pixelated] lg:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image */}
              <img src={`/art/scenes/${NEXT_SCENE[artSet(next.id)]}/240x84-empty.svg`} width={1440} height={504} alt="" className="hidden max-w-none [image-rendering:pixelated] lg:block" />
            </div>
            <div className="flex flex-col gap-3.5 px-4 pt-5 pb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16 lg:px-18 lg:pt-10 lg:pb-14">
              <div className="flex max-w-180 flex-col gap-3.5 lg:gap-3">
                <div className="text-12 text-crown-muted lg:text-14">{t("next")}</div>
                <h2 className="text-28 leading-[1.15] font-bold lg:text-40 lg:leading-tight">{seasonT("title", { n: next.id, name: next.name[locale] })}</h2>
                <div className="flex flex-col gap-1 lg:hidden">
                  <div className="text-14 text-crown-muted">{counting ? t("startsIn") : t("nextStarted", { date: date(next.startsAt) })}</div>
                  {counting && nextStart && <div className="font-pixel text-40 leading-none font-bold tabular-nums">{formatClock((nextStart - now) / 1000, u)}</div>}
                </div>
                <p className="text-16 leading-body text-pretty lg:text-20 lg:leading-[1.45] lg:font-medium">
                  {seasonT.has(`nextDesc.${next.id}` as "nextDesc.1")
                    ? seasonT(`nextDesc.${next.id}` as "nextDesc.1", { price: formatPrice(data.floorCents, locale) })
                    : seasonT("nextDescProvisional", { price: formatPrice(data.floorCents, locale) })}
                </p>
                {keep && <p className="text-14 leading-body text-pretty text-crown-muted">{keep}</p>}
                <div className="flex flex-col gap-1 lg:hidden">{nextActions}</div>
              </div>
              <div className="hidden flex-col items-end gap-4 lg:flex">
                <div className="flex flex-col items-end gap-1.5">
                  <div className="text-16 text-crown-muted">{counting ? t("startsIn") : t("nextStarted", { date: date(next.startsAt) })}</div>
                  {counting && nextStart && <div className="font-pixel text-64 leading-none font-bold tabular-nums">{formatClock((nextStart - now) / 1000, u)}</div>}
                </div>
                <div className="flex flex-row-reverse items-center gap-4">{nextActions}</div>
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer season={current.id} now={now} />
    </div>
  );
}
