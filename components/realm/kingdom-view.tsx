"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Flag, Portrait, RankTag } from "@/components/art";
import { Footer } from "@/components/home/sections";
import { useServerNow } from "@/components/home/use-live-home";
import { TopBar } from "@/components/top-bar";
import { Link } from "@/i18n/navigation";
import { formatClock, formatDuration } from "@/lib/format";
import { type HistoryEntry, type SeasonInfo, type SeasonSummary, HISTORY_PAGE, fetchHistoryPage } from "@/lib/realm/data";
import { publicClient } from "@/lib/supabase/public";
import { segmentClass, useDates } from "./common";
import { usePlayerName } from "@/components/player-name";
import { isFormerName } from "@/lib/game/former";

const HOUR = 3600;
type Tier = "L" | "M" | "S";

/** Size by length of reign: under 3 h ×1 on one line, from 3 h ×2, from 10 h ×3 (×4 desktop). */
function tierOf(seconds: number): Tier {
  return seconds >= 10 * HOUR ? "L" : seconds >= 3 * HOUR ? "M" : "S";
}

const TIER = {
  L: { scaleM: 3, scaleD: 4, node: 16, nameM: "text-20", nameD: "lg:text-28", durM: "text-40", durD: "lg:text-64", msgM: "text-16 line-clamp-4", msgD: "lg:text-20 lg:font-medium", box: "bg-crown-velvet p-4 shadow-[inset_0_4px_0_var(--crown-hall)] lg:p-6", timeTop: 20 },
  M: { scaleM: 2, scaleD: 2, node: 12, nameM: "text-16", nameD: "lg:text-20", durM: "text-28", durD: "lg:text-40", msgM: "text-14 line-clamp-2", msgD: "lg:text-16", box: "py-2 lg:py-3", timeTop: 44 },
  S: { scaleM: 1, scaleD: 1, node: 8, nameM: "text-14", nameD: "lg:text-16", durM: "text-16", durD: "lg:text-20", msgM: "text-12 line-clamp-1", msgD: "lg:text-14", box: "py-1.5", timeTop: 18 },
} as const;

type Props = {
  seasons: SeasonInfo[];
  currentId: number;
  selected: SeasonInfo;
  entries: HistoryEntry[];
  summary: SeasonSummary;
  readAt: string;
};

function Entry({ entry, now, season }: { entry: HistoryEntry; now: number; season: number }) {
  const nameOf = usePlayerName();
  const t = useTranslations("realm");
  const home = useTranslations("home");
  const rank = useTranslations("rank");
  const units = useTranslations("common.units");
  const u = { h: units("h"), m: units("m"), s: units("s") };
  const { time } = useDates();
  const seconds = entry.open ? (now - new Date(entry.startedAt).getTime()) / 1000 : (entry.durationSeconds ?? 0);
  const tier = TIER[tierOf(seconds)];
  const size = tierOf(seconds);
  const node = entry.open ? 16 : tier.node;
  const nodeColor = entry.open ? "var(--crown-gold)" : size === "L" ? "var(--crown-text)" : "var(--crown-stone)";
  const duration = entry.open ? formatClock(seconds, u) : formatDuration(seconds, u);
  const end = entry.open ? t("now") : entry.dethronedBy ? t("by", { name: nameOf(entry.dethronedBy) }) : t("endedTag");
  const portrait = (scale: number) => (
    <Portrait avatar={entry.avatar} rank={entry.rank} season={season} crown={entry.open} scale={scale} />
  );
  const nameRow = (
    <div className="flex flex-wrap items-center gap-2 lg:gap-2.5">
      {isFormerName(entry.name) ? (
        <span className={`font-bold ${tier.nameM} ${tier.nameD}`}>{nameOf(entry.name)}</span>
      ) : (
        <Link href={`/u/${entry.name.toLowerCase()}`} className={`font-bold hover:underline ${tier.nameM} ${tier.nameD}`}>
          {entry.name}
        </Link>
      )}
      <Flag code={entry.countryCode} />
      <span className={size === "S" ? "hidden lg:block" : ""}>
        <RankTag rank={entry.rank} label={rank(entry.rank)} small />
      </span>
      {entry.reversed && (
        <span className="flex h-6 items-center rounded-tag border border-crown-danger px-2 font-pixel text-12 font-medium text-crown-danger">{t("reversed")}</span>
      )}
    </div>
  );
  const message = entry.message && <p className={`leading-[1.45] text-pretty ${tier.msgM} ${tier.msgD} lg:line-clamp-none lg:max-w-[560px]`}>{home("quote", { message: entry.message })}</p>;

  return (
    <div className="relative mb-2 lg:mb-2.5 lg:pl-11" data-testid="history-entry">
      <span
        aria-hidden
        className="absolute left-[calc(-20px-var(--n)/2)] lg:left-[calc(20px-var(--n)/2)]"
        style={{ ["--n" as string]: `${node}px`, top: size === "L" ? 24 : size === "M" ? 44 - node / 2 : 28 - node / 2, width: node, height: node, background: nodeColor }}
      />
      <div className="absolute -left-35 hidden w-29 text-right font-pixel text-14 font-medium text-crown-muted lg:block" style={{ top: tier.timeTop }}>
        {time(entry.startedAt)}
      </div>
      {/* Mobile */}
      <div className={`flex items-start gap-3 lg:hidden ${tier.box}`}>
        {portrait(tier.scaleM)}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {nameRow}
          <div className={`font-pixel leading-none font-bold tabular-nums ${tier.durM}`}>{duration}</div>
          {message}
          <div className="text-12 text-crown-muted">
            {time(entry.startedAt)} · <span className={`font-bold ${entry.open ? "text-crown-gold" : ""}`}>{end}</span>
          </div>
        </div>
      </div>
      {/* Desktop */}
      <div className={`hidden items-center gap-5 lg:flex ${tier.box}`}>
        {portrait(tier.scaleD)}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {nameRow}
          {message}
          <div className={`text-14 font-bold ${entry.open ? "text-crown-gold" : "text-crown-muted"}`}>{end}</div>
        </div>
        <div className={`font-pixel leading-none font-bold whitespace-nowrap tabular-nums ${tier.durD}`}>{duration}</div>
      </div>
    </div>
  );
}

export function KingdomView({ seasons, currentId, selected, entries: initial, summary, readAt }: Props) {
  const t = useTranslations("realm");
  const seasonT = useTranslations("season");
  const units = useTranslations("common.units");
  const u = { h: units("h"), m: units("m"), s: units("s") };
  const now = useServerNow(readAt);
  const { day, date, dayKey, locale } = useDates();
  const [entries, setEntries] = useState(initial);
  const [more, setMore] = useState(initial.length === HISTORY_PAGE);
  const [loading, setLoading] = useState(false);
  const current = seasons.find((s) => s.id === currentId) ?? selected;

  const loadEarlier = async () => {
    const last = entries.at(-1);
    if (!last || loading) return;
    setLoading(true);
    const page = await fetchHistoryPage(publicClient(), selected.id, last.startedAt).catch(() => []);
    setEntries((e) => [...e, ...page]);
    setMore(page.length === HISTORY_PAGE);
    setLoading(false);
  };

  // Seasons that have started, plus the next one (not selectable until it starts).
  const options = seasons
    .filter((s) => s.id <= currentId + 1)
    .map((s) => ({
      season: s,
      disabled: s.id > currentId,
      sub: s.id > currentId ? day(s.startsAt) : s.id === currentId ? t("nowTag") : t("endedTag"),
    }))
    .slice(-2);

  const todayKey = dayKey(now);
  const rows: ({ kind: "day"; key: string; label: string } | { kind: "entry"; entry: HistoryEntry })[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.startedAt);
    if (rows.findLast((r) => r.kind === "day")?.key !== key) {
      rows.push({ kind: "day", key, label: key === todayKey ? t("today", { date: day(entry.startedAt) }) : day(entry.startedAt) });
    }
    rows.push({ kind: "entry", entry });
  }

  const seasonName = seasonT("title", { n: selected.id, name: selected.name[locale] });
  const began = t("began", { season: seasonName, date: date(selected.startsAt) });
  const summaryItems = [
    { v: summary.reigns, l: t("reigns"), L: t("reignsL") },
    { v: summary.kings, l: t("kings"), L: t("kingsL") },
    { v: summary.countries, l: t("countries"), L: t("countriesL") },
  ];

  const seasonLink = (o: (typeof options)[number], variant: "mobile" | "desktop") => {
    const on = o.season.id === selected.id;
    const inner = (
      <>
        <span>{variant === "mobile" ? t("seasonN", { n: o.season.id }) : seasonT("title", { n: o.season.id, name: o.season.name[locale] })}</span>
        <span className="text-12 font-medium text-crown-muted">{o.sub}</span>
      </>
    );
    const cls =
      variant === "mobile"
        ? `hit-area flex h-11 flex-1 flex-col items-center justify-center gap-px text-14 font-bold ${o.disabled ? "cursor-not-allowed text-crown-muted" : segmentClass(on)}`
        : `hit-area flex h-13 items-center justify-between px-4 text-14 font-bold ${
            on && !o.disabled ? "bg-crown-velvet shadow-[inset_4px_0_0_var(--crown-text)]" : "shadow-[inset_0_0_0_2px_var(--crown-velvet)]"
          } ${o.disabled ? "cursor-not-allowed text-crown-muted" : ""}`;
    if (o.disabled) {
      return (
        <span key={o.season.id} aria-disabled="true" className={cls}>
          {inner}
        </span>
      );
    }
    return (
      <Link key={o.season.id} href={`/kingdom?season=${o.season.slug}`} aria-current={on ? "page" : undefined} className={cls}>
        {inner}
      </Link>
    );
  };

  return (
    <div className="flex min-h-dvh flex-col bg-crown-ink">
      <TopBar season={current} now={now} section="history" />
      <main className="flex-1">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-16 lg:px-18 lg:pt-12 lg:pb-16">
          <div className="flex min-w-0 flex-col lg:gap-6">
            <div className="flex flex-col gap-4 px-4 pt-6 pb-4 lg:p-0">
              <h1 className="text-28 leading-[1.15] font-bold lg:text-40 lg:leading-tight">{t("histTitle")}</h1>
              <nav aria-label={t("season")} className="flex gap-1 bg-crown-page p-1 shadow-ring-2 lg:hidden">
                {options.map((o) => seasonLink(o, "mobile"))}
              </nav>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-14 text-crown-muted lg:hidden">
                {summaryItems.map((s) => (
                  <div key={s.l}>
                    <span className="font-pixel font-bold text-crown-text">{s.v}</span> {s.l}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-4 pb-6 pl-7 lg:mx-0 lg:pb-0 lg:pl-35">
              <span aria-hidden className="absolute top-0 bottom-6 left-1.5 w-1 bg-crown-hall lg:bottom-0 lg:left-[158px]" />
              {rows.length === 0 && <p className="relative py-5 text-14 text-crown-muted lg:pl-11">{t("noMore")}</p>}
              {rows.map((row) =>
                row.kind === "day" ? (
                  <div key={row.key} className="relative pt-5 pb-2.5 text-12 font-bold text-crown-muted lg:pt-6 lg:pb-3 lg:pl-11 lg:text-14">
                    <span aria-hidden className="absolute top-5.5 -left-6.5 h-1 w-3 bg-crown-stone lg:top-7.5 lg:left-3 lg:w-4" />
                    <h2>{row.label}</h2>
                  </div>
                ) : (
                  <Entry key={row.entry.reignId} entry={row.entry} now={now} season={selected.id} />
                ),
              )}
              <div className="relative flex flex-col gap-3 pt-3 lg:flex-row lg:items-center lg:gap-6 lg:pt-4 lg:pl-11">
                {more && (
                  <button
                    type="button"
                    onClick={() => void loadEarlier()}
                    disabled={loading}
                    className="hit-area m-1 h-12 bg-crown-hall px-5 text-14 font-bold shadow-relief-card hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-ink"
                  >
                    {t("earlier")}
                  </button>
                )}
                <div className="text-12 text-crown-muted lg:text-14">{more ? null : began}</div>
              </div>
            </div>
          </div>

          <aside className="hidden flex-col gap-8 pt-2 lg:flex">
            <div className="flex flex-col gap-2.5">
              <div className="text-14 font-bold">{t("season")}</div>
              <nav aria-label={t("season")} className="flex flex-col gap-1">
                {options.map((o) => seasonLink(o, "desktop"))}
              </nav>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {[...summaryItems.map((s) => ({ l: s.L, v: String(s.v) })), { l: t("longestL"), v: summary.longestSeconds === null ? "—" : formatDuration(summary.longestSeconds, u) }].map((s) => (
                <div key={s.l} className="flex flex-col gap-2 bg-crown-velvet p-4">
                  <div className="text-12 text-crown-muted">{s.l}</div>
                  <div className="font-pixel text-28 leading-none font-bold">{s.v}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <div className="text-14 font-bold">{t("legend")}</div>
              {[36, 24, 12].map((w, i) => (
                <div key={w} className="flex items-center gap-3 text-14 text-crown-muted">
                  <span className="flex-none bg-crown-hall" style={{ width: w, height: w }} />
                  {t(`lg.${i}` as "lg.0")}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
      <Footer season={current.id} now={now} />
    </div>
  );
}
