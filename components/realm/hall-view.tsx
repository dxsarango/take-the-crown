"use client";

import { useMessages, useTranslations } from "next-intl";
import { useState } from "react";
import { Flag, Portrait } from "@/components/art";
import { Footer } from "@/components/home/sections";
import { useServerNow } from "@/components/use-server-now";
import { TopBar } from "@/components/top-bar";
import { Link } from "@/i18n/navigation";
import { countryName } from "@/lib/countries";
import { formatDuration, formatDurationPrecise } from "@/lib/format";
import { HALL_TABS, type HallRow, type HallScope, type HallTab, type SeasonInfo } from "@/lib/realm/data";
import { segmentClass, useDates } from "./common";
import { Podium, type PodiumSpot } from "./podium";
import { usePlayerName } from "@/components/player-name";
import { isFormerName, profileHref } from "@/lib/game/former";

type Props = {
  current: SeasonInfo;
  next: SeasonInfo | null;
  /** More than one season has started, so all time differs from this season. */
  manySeasons: boolean;
  hall: { season: HallScope; all: HallScope };
  readAt: string;
};

export function HallView({ current, next, manySeasons, hall, readAt }: Props) {
  const nameOf = usePlayerName();
  const t = useTranslations("realm");
  const home = useTranslations("home");
  const rank = useTranslations("rank");
  const units = useTranslations("common.units");
  const messages = useMessages() as { country: Record<string, string> };
  const u = { h: units("h"), m: units("m"), s: units("s") };
  const now = useServerNow(readAt);
  const { day, locale } = useDates();
  const [scope, setScope] = useState<"season" | "all">("season");
  const [tab, setTab] = useState<HallTab>("longest");
  const tabIndex = HALL_TABS.indexOf(tab);
  const rows = hall[scope].tabs[tab];

  const value = (row: HallRow) => {
    if (tab === "most") return String(row.value);
    if (tab === "shortest") return formatDurationPrecise(row.value, u);
    if (tab === "countries") return `${Math.floor(row.value / 3600)}${u.h}`;
    return formatDuration(row.value, u);
  };
  const label = (row: HallRow) => (row.kind === "person" ? nameOf(row.person.name) : countryName(row.countryCode, locale, messages.country));
  const sub = (row: HallRow) => (row.kind === "person" ? rank(row.person.rank) : t("kingsN", { count: row.kings }));

  const spots: PodiumSpot[] = rows.slice(0, 3).map((row) =>
    row.kind === "person"
      ? { key: row.person.profileId, value: value(row), name: label(row), href: profileHref(row.person.name), person: row.person }
      : { key: row.countryCode, value: value(row), name: label(row), countryCode: row.countryCode },
  );
  const note =
    scope === "all" ? (manySeasons ? t("allNoteMany") : t("allNote", { n: current.id, next: next?.id ?? current.id + 1, date: next ? day(next.startsAt) : "" })) : null;

  const scopes = (
    <div role="radiogroup" aria-label={t("scopeLabel")} className="flex gap-1 bg-crown-page p-1 shadow-ring-2">
      {(["season", "all"] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={scope === s}
          onClick={() => setScope(s)}
          className={`hit-area h-10 flex-1 px-4 text-14 font-bold lg:min-w-30 ${segmentClass(scope === s)}`}
        >
          {s === "season" ? t("seasonN", { n: current.id }) : t("scopes.1")}
        </button>
      ))}
    </div>
  );

  const tabs = (
    <div role="tablist" aria-label={t("tabsLabel")} className="-mx-4 flex gap-1 overflow-x-auto px-4 pt-1 [scrollbar-width:none] lg:mx-0 lg:px-0 lg:pt-0 lg:shadow-[inset_0_-4px_0_var(--crown-velvet)]">
      {HALL_TABS.map((key, i) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          onClick={() => setTab(key)}
          className={`hit-area h-11 flex-none px-3.5 text-14 font-bold whitespace-nowrap focus-visible:outline-offset-[-2px] lg:h-13 lg:px-6 lg:text-16 ${
            tab === key ? "bg-crown-velvet shadow-[inset_0_-4px_0_var(--crown-text)]" : "text-crown-muted"
          }`}
        >
          {t(`tabs.${i}` as "tabs.0")}
        </button>
      ))}
    </div>
  );

  const list = (
    <ol className="flex flex-col">
      {rows.slice(3).map((row, i) => (
        <li key={row.kind === "person" ? row.person.profileId : row.countryCode} className="flex items-center gap-3 py-2.5 shadow-[inset_0_-2px_0_var(--crown-velvet)] lg:gap-4 lg:py-3">
          <span className="w-6 flex-none text-right font-pixel text-16 font-bold text-crown-muted lg:w-8 lg:text-20">{i + 4}</span>
          {row.kind === "person" ? (
            <Portrait avatar={row.person.avatar} rank={row.person.rank} season={current.id} crown={false} scale={1} />
          ) : (
            <span className="flex size-11 flex-none items-center justify-center bg-crown-velvet">
              <Flag code={row.countryCode} />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:flex-row lg:items-center lg:gap-2.5">
            <div className="flex min-w-0 items-center gap-1.5">
              {row.kind === "person" && !isFormerName(row.person.name) ? (
                <Link href={`/u/${row.person.name.toLowerCase()}`} className="truncate text-14 font-bold hover:underline lg:text-16">
                  {label(row)}
                </Link>
              ) : (
                <span className="truncate text-14 font-bold lg:text-16">{label(row)}</span>
              )}
              {row.kind === "person" && <Flag code={row.person.countryCode} />}
            </div>
            <div className="text-12 text-crown-muted lg:text-14">{sub(row)}</div>
          </div>
          <span className="font-pixel text-20 font-bold whitespace-nowrap lg:text-28">{value(row)}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-crown-ink">
      <TopBar season={current} now={now} section="hof" />
      <main className="flex flex-1 flex-col gap-4 px-4 pt-6 pb-8 lg:gap-7 lg:px-18 lg:pt-12 lg:pb-16">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
          <h1 className="text-28 leading-[1.15] font-bold lg:text-40 lg:leading-tight">{t("hofTitle")}</h1>
          {scopes}
        </div>
        {tabs}
        <div role="tabpanel" className="flex flex-col gap-4 lg:grid lg:grid-cols-[520px_minmax(0,1fr)] lg:items-start lg:gap-16">
          <div className="flex flex-col gap-4">
            {note && <p className="bg-crown-velvet px-3 py-2.5 text-12 leading-[1.45] text-crown-muted lg:order-2 lg:px-4 lg:py-3 lg:text-14">{note}</p>}
            <p className="text-12 text-crown-muted lg:order-1 lg:text-14">{t(`tabSubs.${tabIndex}` as "tabSubs.0")}</p>
            <div className="-mx-4 px-4 pt-1 lg:order-3 lg:mx-0 lg:px-0 lg:pt-3">
              {rows.length ? <Podium spots={spots} season={current.id} /> : <p className="py-6 text-14 text-crown-muted">{home("noReigns")}</p>}
            </div>
          </div>
          <div className="lg:pt-7.5">{list}</div>
        </div>
      </main>
      <Footer season={current.id} now={now} />
    </div>
  );
}
