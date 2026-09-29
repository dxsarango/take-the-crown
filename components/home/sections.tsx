"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Flag, Portrait } from "@/components/art";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { BRAND_NAME } from "@/lib/config/brand";
import { seasonArt } from "@/lib/art/seasons";
import { MEDAL_KEY } from "@/lib/game/achievements";
import { formatAgo, formatDuration } from "@/lib/format";
import type { FeedItem, HallOfFame, PastReign, Person } from "@/lib/home/data";

function useUnits() {
  const t = useTranslations("common.units");
  return { h: t("h"), m: t("m"), s: t("s") };
}

const SECTION = "mx-4 flex flex-col shadow-[var(--crown-bar-top)] lg:mx-0";

function SectionLink({ href, children }: { href: "/kingdom" | "/hall-of-fame"; children: ReactNode }) {
  return (
    <Link href={href} className="hit-area text-14 text-crown-muted underline underline-offset-4 hover:text-crown-text">
      {children}
    </Link>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-14 text-crown-muted">{children}</p>;
}

export function Succession({ reigns, season }: { reigns: PastReign[]; season: number }) {
  const t = useTranslations("home");
  const units = useUnits();
  return (
    <section className={`${SECTION} gap-3.5 py-6 lg:gap-5 lg:pt-8 lg:pb-10`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-20 font-bold">{t("succession")}</h2>
        <SectionLink href="/kingdom">{t("history")}</SectionLink>
      </div>
      {reigns.length === 0 ? (
        <Empty>{t("noReigns")}</Empty>
      ) : (
        <ol className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-10 lg:overflow-visible lg:px-0 lg:pb-0">
          {reigns.map((reign) => (
            <li key={reign.reignId} className="flex w-22 flex-none flex-col gap-1.5 lg:w-auto lg:min-w-0 lg:gap-2">
              <Portrait avatar={reign.avatar} rank={reign.rank} season={season} crown={false} scale={2} />
              <div className="truncate text-14 font-bold">{reign.name}</div>
              <div className="flex items-center gap-1.5">
                <Flag code={reign.countryCode} />
                <span className="font-pixel text-14 font-medium whitespace-nowrap text-crown-muted">
                  {formatDuration(reign.durationSeconds, units)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type HofRecord = { label: string; person: Person; value: string; unit: string };

export function HallOfFamePreview({ hall, season }: { hall: HallOfFame; season: number }) {
  const t = useTranslations("home");
  const units = useUnits();
  const records: HofRecord[] = [];
  if (hall.longest) records.push({ label: t("longest"), person: hall.longest, value: formatDuration(hall.longest.seconds, units), unit: "" });
  if (hall.most) records.push({ label: t("most"), person: hall.most, value: String(hall.most.crowns), unit: t("crowns") });
  if (hall.shortest) records.push({ label: t("shortest"), person: hall.shortest, value: formatDuration(hall.shortest.seconds, units), unit: "" });

  return (
    <div className="flex flex-col gap-3.5 lg:gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-20 font-bold">{t("hof")}</h2>
          <span className="text-12 text-crown-muted">{t("hofSub")}</span>
        </div>
        <SectionLink href="/hall-of-fame">{t("hofAll")}</SectionLink>
      </div>
      {records.length === 0 ? (
        <Empty>{t("noReigns")}</Empty>
      ) : (
        <ul className="flex flex-col gap-1 lg:grid lg:grid-cols-3">
          {records.map(({ label, person, value, unit }) => (
            <li key={label} className="bg-crown-velvet">
              {/* Mobile row */}
              <div className="flex items-center gap-3 px-3 py-2.5 lg:hidden">
                <Portrait avatar={person.avatar} rank={person.rank} season={season} crown={false} scale={1} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="text-12 text-crown-muted">{label}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-14 font-bold">{person.name}</span>
                    <Flag code={person.countryCode} />
                  </div>
                </div>
                <div className="flex flex-none items-baseline gap-1">
                  <span className="font-pixel text-20 font-bold">{value}</span>
                  {unit && <span className="font-pixel text-12 font-medium text-crown-muted">{unit}</span>}
                </div>
              </div>
              {/* Desktop card */}
              <div className="hidden flex-col gap-3.5 p-5 lg:flex">
                <div className="text-12 text-crown-muted">{label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-pixel text-28 leading-none font-bold">{value}</span>
                  {unit && <span className="font-pixel text-14 font-medium text-crown-muted">{unit}</span>}
                </div>
                <div className="flex items-center gap-2.5">
                  <Portrait avatar={person.avatar} rank={person.rank} season={season} crown={false} scale={1} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-14 font-bold">{person.name}</span>
                    <Flag code={person.countryCode} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedLine({ item }: { item: FeedItem }) {
  const t = useTranslations("home.feed");
  const medals = useTranslations("medals");
  switch (item.kind) {
    case "dethroned":
      return (
        <>
          {t("fellTo")} <span className="font-bold text-crown-text">{item.by.name}</span>
        </>
      );
    case "first_reign":
      return <>{t("firstReign")}</>;
    case "achievement":
      if (item.code === "patriot") return <>{t("patriot")}</>;
      return (
        <>
          {t("earned")} <span className="font-bold text-crown-text">{medals(`${MEDAL_KEY[item.code]}.name`)}</span>
        </>
      );
  }
}

export function Feed({ items, now }: { items: FeedItem[]; now: number }) {
  const t = useTranslations("home");
  const locale = useLocale() as Locale;
  const units = useUnits();
  return (
    <div className="flex flex-col gap-1.5 lg:gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="size-2 bg-crown-text" aria-hidden />
          <h2 className="text-20 font-bold">{t("live")}</h2>
        </div>
        <span className="text-12 text-crown-muted lg:hidden">{t("last24")}</span>
      </div>
      {items.length === 0 ? (
        <Empty>{t("feedEmpty")}</Empty>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li
              key={item.id}
              className="grid min-h-11 grid-cols-[132px_minmax(0,1fr)_60px] items-center gap-2.5 shadow-[inset_0_-2px_0_var(--crown-velvet)] lg:grid-cols-[140px_minmax(0,1fr)_72px_64px] lg:gap-3"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <Flag code={item.who.countryCode} />
                <span className="truncate text-14 font-bold">{item.who.name}</span>
              </div>
              <div className="truncate text-14 text-crown-muted">
                <FeedLine item={item} />
              </div>
              <div className="text-right font-pixel text-14 font-bold whitespace-nowrap">
                {item.kind === "dethroned" && item.durationSeconds !== null ? formatDuration(item.durationSeconds, units) : ""}
              </div>
              <div className="hidden text-right text-12 whitespace-nowrap text-crown-muted lg:block">
                {formatAgo(item.createdAt, now, locale)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Footer({ season, now }: { season: number; now: number }) {
  const home = useTranslations("home");
  const common = useTranslations("common");
  const art = seasonArt(season);
  const links = (
    <>
      {(["rules", "faq", "terms"] as const).map((key) => (
        <Link
          key={key}
          href={`/${key}`}
          className="hit-area underline decoration-crown-muted underline-offset-4 hover:decoration-crown-text"
        >
          {home(key)}
        </Link>
      ))}
    </>
  );
  return (
    <footer className="flex flex-col">
      <div className="h-0.5" style={{ background: art.stone.cap }} />
      <div
        className="flex flex-col gap-3.5 px-4 pt-5 pb-7 [image-rendering:pixelated] lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-18 lg:py-6"
        style={{
          backgroundColor: art.stone.base,
          backgroundImage: `url(/art/seal/stone-band-t${art.asset}.svg)`,
          backgroundSize: "96px 36px",
        }}
      >
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:gap-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by next/image */}
            <img src={`/art/seal/seal-t${art.asset}.svg`} width={40} height={40} alt="" className="block flex-none [image-rendering:pixelated]" />
            <span className="font-pixel text-14 font-medium">
              {home("copyright", { year: new Date(now).getUTCFullYear(), brand: BRAND_NAME })}
            </span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-3 text-14 font-medium lg:gap-6">{links}</nav>
        </div>
        <p className="text-12 leading-body text-crown-muted">{common("final")}</p>
      </div>
    </footer>
  );
}
