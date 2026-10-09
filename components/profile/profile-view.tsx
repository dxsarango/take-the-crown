"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Flag, Icon, Portrait, RankTag } from "@/components/art";
import { useServerNow } from "@/components/use-server-now";
import { Footer } from "@/components/home/sections";
import { useDisplayTimeZone } from "@/components/time-zone";
import { TopBar } from "@/components/top-bar";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { MEDAL_KEY, type AchievementCode } from "@/lib/game/achievements";
import { isFormerName } from "@/lib/game/former";
import { priceAt } from "@/lib/game/price";
import { RANKS, type Rank } from "@/lib/game/rank";
import { clockParts, daysLeft, displayLink, formatDuration, formatPercent, formatPrice } from "@/lib/format";
import type { ChronicleEntry, Collectible, ProfilePage } from "@/lib/profile/public";
import { safeHttpsUrl } from "@/lib/links";
import { socialLabel } from "@/lib/profile/socials";
import { Medal, SeasonFrame, Segments, SocialIcon, figureParts, rarityColor, roman } from "./parts";
import { PlayerName, usePlayerName } from "@/components/player-name";

const CHRONICLE_PREVIEW = 6;
const RANK_SEGMENTS = 20;
const GOAL_SEGMENTS = 10;
const FRAME_MATERIAL: Record<Rank, "iron" | "silver" | "gold" | null> = {
  peasant: null,
  knight: "iron",
  baron: "silver",
  count: "silver",
  duke: "gold",
  emperor: "gold",
};

const sectionClass = "flex flex-col gap-3.5 shadow-[var(--crown-bar-top)] max-lg:mx-4 max-lg:py-6 lg:gap-4";
const titleClass = "text-20 font-bold lg:text-28";

function useFormats() {
  const locale = useLocale() as Locale;
  const units = useTranslations("common.units");
  const timeZone = useDisplayTimeZone();
  const u = { h: units("h"), m: units("m"), s: units("s") };
  return {
    locale,
    duration: (seconds: number) => formatDuration(seconds, u),
    date: (iso: string, withYear = false) =>
      new Intl.DateTimeFormat(locale === "es" ? "es-419" : "en-US", {
        month: "short",
        day: "numeric",
        ...(withYear ? { year: "numeric" } : {}),
        timeZone,
      }).format(new Date(iso)),
  };
}

function Figure({ text, size }: { text: string; size: "mobile" | "desktop" }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 font-pixel leading-none font-bold">
      {figureParts(text).map((p, i) => (
        <div key={i} className="flex items-baseline gap-0.5">
          <span className={size === "mobile" ? "text-[36px]" : "text-[44px]"}>{p.v}</span>
          <span className="text-16 text-crown-muted">{p.u}</span>
        </div>
      ))}
    </div>
  );
}

function ShareButton({ label, className }: { label: string; className: string }) {
  const t = useTranslations("profile");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className={`hit-area m-1 bg-crown-hall text-14 font-bold whitespace-nowrap shadow-relief-card hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-ink ${className}`}
    >
      <span aria-live="polite">{copied ? t("copied") : label}</span>
    </button>
  );
}

function SecondaryLink({ href, children, className }: { href: "/settings/profile"; children: ReactNode; className: string }) {
  return (
    <Link
      href={href}
      className={`hit-area m-1 flex items-center bg-crown-hall text-14 font-bold whitespace-nowrap shadow-relief-card hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-ink ${className}`}
    >
      {children}
    </Link>
  );
}

function Socials({ data, own, size }: { data: ProfilePage; own: boolean; size: "mobile" | "desktop" }) {
  const t = useTranslations("profile");
  const social = useTranslations("social");
  const socials = data.socials.filter(({ url }) => safeHttpsUrl(url));
  if (socials.length) {
    return (
      <ul aria-label={t("socials")} className={`flex flex-wrap gap-2 ${size === "desktop" ? "justify-end" : ""}`}>
        {socials.map(({ key, url }) => (
          <li key={key}>
          <a
            href={url}
            target="_blank"
            rel="sponsored ugc noopener me"
            aria-label={`${social(`${key}.name`)}: ${socialLabel(key, url)}`}
            title={`${social(`${key}.name`)}: ${socialLabel(key, url)}`}
            className="flex size-11 items-center justify-center bg-crown-hall hover:bg-crown-stone"
          >
            <SocialIcon platform={key} size={20} />
          </a>
          </li>
        ))}
      </ul>
    );
  }
  if (!own) return null;
  return (
    <div className="flex min-h-13 items-center justify-between gap-3 border-2 border-dashed border-crown-stone pr-1 pl-3.5">
      <div className={`leading-snug text-crown-muted ${size === "mobile" ? "text-12" : "text-14"}`}>{t("socNone")}</div>
      <Link
        href="/settings/profile"
        className="flex min-h-11 flex-none items-center px-2.5 text-14 font-bold underline underline-offset-4 focus-visible:outline-offset-[-2px]"
      >
        {t("editProfile")}
      </Link>
    </div>
  );
}

function RankProgress({ data, className = "" }: { data: ProfilePage; className?: string }) {
  const t = useTranslations("profile");
  const rank = useTranslations("rank");
  const { duration } = useFormats();
  const index = RANKS.findIndex((r) => r.rank === data.rank);
  const next = RANKS[index + 1];
  const total = data.stats.totalSeconds;
  const title = next ? `${rank(data.rank)} → ${rank(next.rank)}` : rank(data.rank);
  const value = next ? `${duration(total)} / ${duration(next.minSeconds)}` : duration(total);
  const from = RANKS[index].minSeconds;
  const lit = next ? Math.floor(((total - from) / (next.minSeconds - from)) * RANK_SEGMENTS) : RANK_SEGMENTS;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-14 font-bold">{title}</div>
        <div className="font-pixel text-14 font-medium">{value}</div>
      </div>
      <Segments lit={lit} total={RANK_SEGMENTS} color="var(--crown-text)" height={8} />
      <div className="text-12 text-crown-muted">
        {next ? t("rankNote", { time: duration(next.minSeconds - total), rank: rank(next.rank) }) : t("rankTop")}
      </div>
    </div>
  );
}

function Header({ data, own }: { data: ProfilePage; own: boolean }) {
  const t = useTranslations("profile");
  const rank = useTranslations("rank");
  const common = useTranslations("common");
  const { date } = useFormats();
  const joined = t("joined", { date: date(data.joinedAt, true) });
  const mainHref = safeHttpsUrl(data.mainLink);
  const link = mainHref && (
    <a
      href={mainHref}
      target="_blank"
      rel="sponsored ugc noopener"
      className="hit-area font-bold [overflow-wrap:anywhere] underline decoration-2 underline-offset-[5px] max-lg:text-16 lg:text-20 lg:underline-offset-[6px]"
    >
      {displayLink(mainHref)}
    </a>
  );
  const nameTags = (
    <div className="flex flex-wrap items-center gap-2 lg:gap-3">
      <Flag code={data.countryCode} />
      <RankTag rank={data.rank} label={rank(data.rank)} />
      <span className="hidden text-14 text-crown-muted lg:inline">{joined}</span>
    </div>
  );

  return (
    <section className="bg-crown-velvet">
      {/* Mobile */}
      <div className="flex flex-col gap-4.5 px-4 py-6 lg:hidden">
        <div className="flex items-center gap-4">
          <Portrait avatar={data.avatar} rank={data.rank} season={data.season.id} crown={false} scale={3} />
          <div className="flex min-w-0 flex-col gap-2.5">
            <h1 className="text-24 leading-tight font-bold [overflow-wrap:anywhere]">{data.name}</h1>
            {nameTags}
            <div className="text-12 text-crown-muted">{joined}</div>
          </div>
        </div>
        <RankProgress data={data} />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">{link}</div>
          <div className="flex flex-none">
            {own && (
              <SecondaryLink href="/settings/profile" className="h-10 px-3.5">
                {t("editProfile")}
              </SecondaryLink>
            )}
            <ShareButton label={common("share")} className="h-10 px-3.5" />
          </div>
        </div>
        <Socials data={data} own={own} size="mobile" />
      </div>

      {/* Desktop */}
      <div className="hidden grid-cols-[220px_minmax(0,1fr)_auto] items-center gap-10 px-18 py-12 lg:grid">
        <Portrait avatar={data.avatar} rank={data.rank} season={data.season.id} crown={false} scale={5} />
        <div className="flex min-w-0 flex-col gap-3.5">
          <h1 className="text-40 leading-tight font-bold [overflow-wrap:anywhere]">{data.name}</h1>
          {nameTags}
          <RankProgress data={data} className="mt-1.5 w-[480px] max-w-full" />
        </div>
        <div className="flex flex-col items-end gap-4 self-end">
          <Socials data={data} own={own} size="desktop" />
          {link}
          <div className="flex">
            {own && (
              <SecondaryLink href="/settings/profile" className="h-12 px-5">
                {t("editProfile")}
              </SecondaryLink>
            )}
            <ShareButton label={t("shareProfile")} className="h-12 px-5" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Own profile after losing the crown: who reigns now, the live price and the gold button. */
function ComeBack({ data, now }: { data: ProfilePage; now: number }) {
  const nameOf = usePlayerName();
  const t = useTranslations("profile");
  const common = useTranslations("common");
  const { locale, duration } = useFormats();
  const last = data.chronicle[0];
  const king = data.king;
  if (!king || !last || last.open || !last.to) return null;
  const price = priceAt(data.crown.basePriceCents, new Date(data.crown.baseSetAt), new Date(now), data.crown);
  const clock = clockParts((now - new Date(king.startedAt).getTime()) / 1000);
  const clockText = `${clock.h}h ${clock.m}m ${clock.s}s`;
  const dropping = common("dropping", { percent: formatPercent(data.crown.decayBpsPerHour, locale) });

  const status = (
    <div className="flex items-center gap-2.5">
      <span className="flex size-5 flex-none items-center justify-center bg-crown-danger text-crown-ink">
        <Icon name="close" size={8} />
      </span>
      <div className="text-14 font-bold">{t("hookStatus", { name: nameOf(last.to.name), duration: duration(last.durationSeconds ?? 0) })}</div>
    </div>
  );
  const kingRow = (
    <div className="flex items-center gap-3">
      <Portrait avatar={king.avatar} rank={king.rank} season={data.season.id} crown scale={1} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <div className="text-14 font-bold"><PlayerName name={king.name} /></div>
          <Flag code={king.countryCode} />
        </div>
        <div className="text-12 text-crown-muted lg:text-14">
          {t("reigningNow")} <span className="font-pixel text-crown-text tabular-nums">{clockText}</span>
        </div>
      </div>
    </div>
  );
  const button = (className: string) => (
    <Link
      href="/?take=1"
      className={`hit-area m-1 flex h-14 items-center justify-center bg-crown-gold text-18 font-bold text-crown-ink shadow-relief-gold hover:bg-crown-gold-glow hover:shadow-relief-gold-hover focus-visible:outline-offset-[6px] active:bg-crown-gold-old active:pt-1 active:shadow-relief-gold-pressed ${className}`}
    >
      {common("take", { price: formatPrice(price, locale) })}
    </Link>
  );

  return (
    <>
      <div className="m-4 flex flex-col gap-3.5 bg-crown-velvet p-4 lg:hidden">
        {status}
        <div className="text-20 leading-tight font-bold">{t("comeBack")}</div>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">{kingRow}</div>
          <div className="flex flex-col items-end gap-0.5">
            <div className="font-pixel text-28 leading-none font-bold text-crown-gold">{formatPrice(price, locale)}</div>
            <div className="text-12 text-crown-muted">{dropping}</div>
          </div>
        </div>
        {button("")}
      </div>
      <div className="hidden grid-cols-[minmax(0,1fr)_auto] items-center gap-8 bg-crown-velvet p-6 lg:grid">
        <div className="flex flex-col gap-3">
          {status}
          <div className="text-28 leading-tight font-bold">{t("comeBack")}</div>
          {kingRow}
        </div>
        <div className="flex flex-col items-end gap-3.5">
          <div className="flex items-center gap-4">
            <div className="text-14 font-medium">{dropping}</div>
            <div className="font-pixel text-40 leading-none font-bold text-crown-gold">{formatPrice(price, locale)}</div>
          </div>
          {button("min-w-[320px] px-6")}
        </div>
      </div>
    </>
  );
}

type Goal = { key: string; art: ReactNode; name: string; desc: string; value: string; lit: number; color: string };

function useGoals(data: ProfilePage, now: number): Goal[] {
  const nameOf = usePlayerName();
  const t = useTranslations("profile");
  const medals = useTranslations("medals");
  const rank = useTranslations("rank");
  const { locale, duration } = useFormats();
  const has = (code: AchievementCode) => data.achievements.some((a) => a.code === code && a.earnedAt);
  const goals: Goal[] = [];

  const last = data.chronicle[0];
  if (!has("revenge") && last && !last.open && last.to && last.to.name !== data.name) {
    goals.push({
      key: "revenge",
      art: <Medal code="revenge" on={false} scale={2} />,
      name: medals("revenge.name"),
      desc: t("reachRevenge", { name: nameOf(last.to.name) }),
      value: "0 / 1",
      lit: 0,
      color: rarityColor("rare", null),
    });
  }

  const index = RANKS.findIndex((r) => r.rank === data.rank);
  const next = RANKS[index + 1];
  const material = next && FRAME_MATERIAL[next.rank];
  if (next && material) {
    const from = RANKS[index].minSeconds;
    goals.push({
      key: "rank",
      art: <Portrait avatar={data.avatar} rank={next.rank} season={data.season.id} crown={false} scale={1} />,
      name: rank(next.rank),
      desc: t("reachRank", { time: duration(next.minSeconds), frame: t(`frameMaterial.${material}`) }),
      value: `${duration(data.stats.totalSeconds)} / ${duration(next.minSeconds)}`,
      lit: Math.floor(((data.stats.totalSeconds - from) / (next.minSeconds - from)) * GOAL_SEGMENTS),
      color: "var(--crown-text)",
    });
  }

  if (!has("bargain_hunter")) {
    const price = priceAt(data.crown.basePriceCents, new Date(data.crown.baseSetAt), new Date(now), data.crown);
    const floor = formatPrice(data.crown.floorCents, locale);
    const keep = 1 - data.crown.decayBpsPerHour / 10_000;
    const hours = price > data.crown.floorCents && keep > 0 && keep < 1 ? Math.ceil(Math.log(data.crown.floorCents / price) / Math.log(keep)) : 0;
    goals.push({
      key: "bargain",
      art: <Medal code="bargain_hunter" on={false} scale={2} />,
      name: medals("bag.name"),
      desc: hours > 0 ? t("reachBargain", { floor, hours }) : t("reachBargainNow", { floor }),
      value: `${formatPrice(price, locale)} → ${floor}`,
      lit: 0,
      color: rarityColor("common", null),
    });
  }

  if (goals.length < 3 && !has("collector")) {
    goals.push({
      key: "collector",
      art: <Medal code="collector" on={false} scale={2} />,
      name: medals("collector.name"),
      desc: t("reachCollector"),
      value: `${data.stats.crowns} / 10`,
      lit: Math.min(GOAL_SEGMENTS, data.stats.crowns),
      color: rarityColor("epic", null),
    });
  }
  return goals.slice(0, 3);
}

function Reach({ goals }: { goals: Goal[] }) {
  const t = useTranslations("profile");
  if (!goals.length) return null;
  return (
    <section className={sectionClass}>
      <h2 className={titleClass}>{t("reach")}</h2>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3">
        {goals.map((g) => (
          <div key={g.key}>
            <div className="flex items-center gap-3 bg-crown-velvet p-3 lg:hidden">
              {g.art}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-14 font-bold">{g.name}</div>
                  <div className="font-pixel text-12 font-medium whitespace-nowrap">{g.value}</div>
                </div>
                <div className="text-12 leading-snug text-crown-muted">{g.desc}</div>
                <Segments lit={g.lit} total={GOAL_SEGMENTS} color={g.color} height={4} />
              </div>
            </div>
            <div className="hidden h-full flex-col gap-3 bg-crown-velvet p-5 lg:flex">
              <div className="flex items-center gap-3">
                {g.art}
                <div className="text-16 font-bold">{g.name}</div>
              </div>
              <div className="min-h-10 text-14 leading-[1.45] text-crown-muted">{g.desc}</div>
              <div className="flex flex-col gap-1.5">
                <div className="font-pixel text-14 font-medium">{g.value}</div>
                <Segments lit={g.lit} total={GOAL_SEGMENTS} color={g.color} height={4} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Showcase({ data, own, goals }: { data: ProfilePage; own: boolean; goals: Goal[] }) {
  const t = useTranslations("profile");
  const medals = useTranslations("medals");
  const rarity = useTranslations("rarity");
  const { date } = useFormats();
  const chosen = data.showcase
    .map((code) => data.achievements.find((a) => a.code === code && a.earnedAt))
    .filter((a) => a !== undefined);
  if (!own && chosen.length === 0) return null;
  const slots = own ? [...chosen, ...Array.from({ length: 3 - chosen.length }, () => null)] : chosen;
  const closest = goals.find((g) => g.key !== "rank");
  const hint = closest ? t("showNext", { name: closest.name }) : t("showEmpty");
  const hintCode: AchievementCode =
    closest?.key === "revenge" ? "revenge" : closest?.key === "bargain" ? "bargain_hunter" : "collector";

  return (
    <section className={sectionClass}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={titleClass}>{t("showcase")}</h2>
        <div className="text-12 text-crown-muted lg:text-14">
          {own ? t("showSlots", { n: chosen.length }) : t("showChosen", { name: data.name })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5 lg:gap-3">
        {slots.map((a, i) =>
          a ? (
            <div key={a.code} className="min-w-0">
              <div className="flex flex-col gap-2 lg:hidden">
                <div
                  className="flex h-28 items-center justify-center bg-crown-velvet"
                  style={{ boxShadow: `inset 0 4px 0 ${rarityColor(a.rarity, a.seasonId)}` }}
                >
                  <Medal code={a.code} on scale={4} />
                </div>
                <div className="text-14 leading-tight font-bold">{medals(`${MEDAL_KEY[a.code]}.name`)}</div>
                <div className="flex items-center gap-1.5">
                  <span className="size-2" style={{ background: rarityColor(a.rarity, a.seasonId) }} />
                  <span className="font-pixel text-12 font-medium text-crown-muted">{rarity(a.rarity)}</span>
                </div>
              </div>
              <div
                className="hidden flex-col items-center gap-4 bg-crown-velvet px-5 pt-7 pb-5 text-center lg:flex"
                style={{ boxShadow: `inset 0 4px 0 ${rarityColor(a.rarity, a.seasonId)}` }}
              >
                <Medal code={a.code} on scale={5} />
                <div className="flex flex-col items-center gap-1.5">
                  <div className="text-20 font-bold">{medals(`${MEDAL_KEY[a.code]}.name`)}</div>
                  <div className="flex h-6 items-center gap-1.5 rounded-tag border border-crown-stone px-2">
                    <span className="size-2" style={{ background: rarityColor(a.rarity, a.seasonId) }} />
                    <span className="font-pixel text-12 font-medium">{rarity(a.rarity)}</span>
                  </div>
                  <div className="text-12 text-crown-muted">{t("unlockedOn", { date: date(a.earnedAt!) })}</div>
                </div>
              </div>
            </div>
          ) : (
            <div key={`empty-${i}`} className="min-w-0">
              <div className="flex flex-col gap-2 lg:hidden">
                <div className="flex h-28 items-center justify-center border-2 border-dashed border-crown-stone p-2.5">
                  {i === chosen.length && <Medal code={hintCode} on={false} scale={2} />}
                </div>
                {i === chosen.length && <div className="text-12 leading-snug text-crown-muted">{hint}</div>}
              </div>
              <div className="hidden h-full min-h-66 flex-col items-center justify-center gap-4 border-2 border-dashed border-crown-stone px-5 py-7 text-center lg:flex">
                {i === chosen.length && (
                  <>
                    <Medal code={hintCode} on={false} scale={3} />
                    <div className="max-w-50 text-14 leading-[1.45] text-crown-muted">{hint}</div>
                  </>
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function Achievements({ data }: { data: ProfilePage }) {
  const t = useTranslations("profile");
  const medals = useTranslations("medals");
  const { locale } = useFormats();
  const earned = data.achievements.filter((a) => a.earnedAt).length;
  const pct = (value: number) =>
    t("ofPlayers", {
      percent: new Intl.NumberFormat(locale === "es" ? "es-419" : "en-US", {
        style: "percent",
        maximumFractionDigits: value < 1 ? 1 : 0,
        minimumFractionDigits: value < 1 ? 1 : 0,
      }).format(value / 100),
    });
  return (
    <section className={sectionClass}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={titleClass}>{t("achievements")}</h2>
        <div className="font-pixel text-14 font-medium lg:text-20 lg:font-bold">
          {t("achCount", { n: earned, total: data.achievements.length })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 lg:grid-cols-4">
        {data.achievements.map((a) => {
          const on = a.earnedAt !== null;
          const key = MEDAL_KEY[a.code];
          const dot = <span className="size-1.5 flex-none" style={{ background: rarityColor(a.rarity, a.seasonId) }} />;
          return (
            <div key={a.code} className={`flex min-w-0 gap-1.5 px-2.5 py-3 max-lg:flex-col lg:items-start lg:gap-3 lg:p-3.5 ${on ? "bg-crown-velvet" : "bg-[#17141F]"}`}>
              <Medal code={a.code} on={on} scale={2} />
              <div className="flex min-w-0 flex-col gap-1.5 lg:gap-1">
                <div className={`text-12 leading-[1.3] font-bold lg:text-14 lg:leading-tight ${on ? "" : "text-crown-muted"}`}>
                  {medals(`${key}.name`)}
                </div>
                <div className="flex items-center gap-1.5">
                  {dot}
                  <span className="text-12 text-crown-muted">{pct(a.holderPct)}</span>
                </div>
                {!on && <div className="hidden text-12 leading-snug text-crown-muted lg:block">{medals(`${key}.condition`)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Person({ person }: { person: { name: string; countryCode: string | null } | null }) {
  const t = useTranslations("profile");
  if (!person) return <span className="font-bold">{t("fromEmpty")}</span>;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="font-bold"><PlayerName name={person.name} /></span>
      <Flag code={person.countryCode} />
    </span>
  );
}

function ChronicleRow({ entry, number, now }: { entry: ChronicleEntry; number: number; now: number }) {
  const t = useTranslations("profile");
  const { duration, date } = useFormats();
  const seconds = entry.open ? (now - new Date(entry.startedAt).getTime()) / 1000 : (entry.durationSeconds ?? 0);
  const to = entry.open ? <span className="font-bold">{t("reigningNow")}</span> : <Person person={entry.to} />;
  return (
    <div className="grid items-start gap-3 shadow-[inset_0_-2px_0_var(--crown-velvet)] max-lg:grid-cols-[36px_minmax(0,1fr)_auto] lg:grid-cols-[48px_96px_minmax(0,1fr)_120px] lg:items-center lg:gap-4">
      <div className="self-stretch py-3.5 font-pixel text-14 font-bold text-crown-muted shadow-[inset_-2px_0_0_var(--crown-hall)] lg:flex lg:items-center lg:py-0">
        {roman(number)}
      </div>
      <div className="hidden py-4 text-14 text-crown-muted lg:block">{date(entry.startedAt)}</div>
      <div className="flex min-w-0 flex-col gap-1.5 py-3.5 lg:hidden">
        <div className="text-12 text-crown-muted">{date(entry.startedAt)}</div>
        <div className="flex flex-col gap-0.5 text-14 leading-body">
          <div className="flex flex-wrap items-center gap-x-1.5">
            <span className="text-crown-muted">{t("chFrom2")}</span>
            <Person person={entry.from} />
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5">
            {!entry.open && <span className="text-crown-muted">{t("chTo2")}</span>}
            {to}
          </div>
        </div>
      </div>
      <div className="hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-4 text-16 leading-body lg:flex">
        <span className="text-crown-muted">{t("chFrom")}</span>
        <Person person={entry.from} />
        {entry.open ? <span className="text-crown-muted">·</span> : <span className="text-crown-muted">{t("chTo")}</span>}
        {to}
      </div>
      <div className="py-3.5 font-pixel text-20 leading-tight font-bold whitespace-nowrap lg:py-4 lg:text-right">{duration(seconds)}</div>
    </div>
  );
}

function Chronicle({ data, now }: { data: ProfilePage; now: number }) {
  const t = useTranslations("profile");
  const [all, setAll] = useState(false);
  const total = data.chronicleTotal;
  const rows = all ? data.chronicle : data.chronicle.slice(0, CHRONICLE_PREVIEW);
  return (
    <section className={`${sectionClass} !gap-1.5 lg:!gap-3`}>
      <div className="flex items-baseline justify-between gap-3 pb-1.5 lg:pb-0">
        <h2 className={titleClass}>{t("history")}</h2>
        <div className="text-12 text-crown-muted lg:text-14">
          {total > CHRONICLE_PREVIEW && !all ? t("histLatest", { n: CHRONICLE_PREVIEW }) : t("histCount", { n: total })}
        </div>
      </div>
      {rows.length === 0 && <p className="text-14 text-crown-muted">{t("histNone")}</p>}
      {rows.map((entry, i) => (
        <ChronicleRow key={entry.reignId} entry={entry} number={total - i} now={now} />
      ))}
      {data.chronicle.length > CHRONICLE_PREVIEW && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="hit-area mt-2 self-start text-14 font-bold underline underline-offset-[5px]"
        >
          {all ? t("showLess") : t("allReigns", { n: total })}
        </button>
      )}
    </section>
  );
}

function Deeds({ data }: { data: ProfilePage }) {
  const t = useTranslations("profile");
  const { duration } = useFormats();
  const items = [
    { label: t("totalR"), value: duration(data.stats.totalSeconds) },
    { label: t("longest"), value: duration(data.stats.longestSeconds) },
    { label: t("crowns"), value: String(data.stats.crowns) },
    { label: t("dethr"), value: String(data.stats.dethroned) },
  ];
  return (
    <section className={`${sectionClass} lg:!gap-3.5`}>
      <h2 className="text-20 font-bold">{t("stats")}</h2>
      <div className="grid grid-cols-2 gap-1">
        {items.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-col gap-2.5 bg-crown-velvet p-3.5 lg:gap-3 lg:p-4.5">
            <div className="lg:hidden">
              <Figure text={item.value} size="mobile" />
            </div>
            <div className="hidden lg:block">
              <Figure text={item.value} size="desktop" />
            </div>
            <div className="text-12 leading-snug text-crown-muted lg:text-14">{item.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Rival({ data, own }: { data: ProfilePage; own: boolean }) {
  const t = useTranslations("profile");
  const rival = data.rival;
  const locale = useLocale();
  const [now] = useState(() => new Date(data.readAt).getTime());
  if (!rival || (!data.showRival && !own)) return null;
  const traded = rival.wins + rival.losses;
  const days = Math.round((new Date(rival.lastAt).getTime() - now) / 86_400_000);
  const hours = Math.round((new Date(rival.lastAt).getTime() - now) / 3_600_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const ago = Math.abs(hours) < 24 ? rtf.format(hours, "hour") : rtf.format(days, "day");
  const note = own && traded === 1 ? t("rivalFirst") : t("rivalNote", { n: traded, ago });
  return (
    <section className={`${sectionClass} lg:!gap-3.5`}>
      <h2 className="text-20 font-bold">{t("rival")}</h2>
      <div className="flex flex-col gap-3.5 bg-crown-velvet p-4 lg:gap-4 lg:p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex w-22 flex-col items-center gap-2">
            <Portrait avatar={data.avatar} rank={data.rank} season={data.season.id} crown={false} scale={2} />
            <div className="max-w-22 truncate text-12 font-bold">{data.name}</div>
          </div>
          <div className="flex items-baseline gap-2.5 font-pixel leading-none font-bold lg:gap-3">
            <span className="text-40">{rival.wins}</span>
            <span className="text-20 text-crown-muted">:</span>
            <span className="text-40">{rival.losses}</span>
          </div>
          <div className="flex w-22 flex-col items-center gap-2">
            <Portrait avatar={rival.avatar} rank={rival.rank} season={data.season.id} crown={false} scale={2} />
            <div className="flex items-center gap-1">
              <div className="max-w-16 truncate text-12 font-bold">
                {isFormerName(rival.name) ? (
                  <PlayerName name={rival.name} />
                ) : (
                  <Link href={`/u/${rival.name.toLowerCase()}`} className="hover:underline">
                    {rival.name}
                  </Link>
                )}
              </div>
              <Flag code={rival.countryCode} />
            </div>
          </div>
        </div>
        <p className="text-center text-12 leading-[1.45] text-pretty text-crown-muted">{note}</p>
      </div>
    </section>
  );
}

function Collectibles({ data, own }: { data: ProfilePage; own: boolean }) {
  const t = useTranslations("profile");
  const { date } = useFormats();
  if (!data.collectibles.length) return null;
  const card = (c: Collectible) => {
    const n = c.seasonId;
    if (c.status === "upcoming" || !c.frame) {
      return {
        art: <span className="font-pixel text-40 font-bold text-crown-muted">?</span>,
        box: "border-2 border-dashed border-crown-stone",
        name: t("collNext", { n }),
        sub: t("collStarts", { date: date(c.startsAt) }),
        muted: true,
      };
    }
    const earned = c.status === "earned";
    const sub = earned
      ? own
        ? t("collEarnedOwn", { n })
        : t("collEarned", { n })
      : c.status === "open"
        ? t("collOpen", { n, days: daysLeft(c.endsAt, new Date(data.readAt).getTime()) })
        : t("collMissed", { n });
    return {
      art: <SeasonFrame frame={c.frame} avatar={data.avatar} season={c.seasonId} locked={!earned} scale={2} />,
      box: earned ? "bg-crown-velvet" : "bg-[#17141F]",
      name: t(`frames.${c.frame}`),
      sub,
      muted: !earned,
    };
  };
  return (
    <section className={`${sectionClass} max-lg:pb-8 lg:!gap-3.5`}>
      <h2 className="text-20 font-bold">{t("collect")}</h2>
      <div className="grid grid-cols-3 gap-2.5">
        {data.collectibles.map((c) => {
          const v = card(c);
          return (
            <div key={c.seasonId} className="flex min-w-0 flex-col gap-2">
              <div className={`flex h-28 items-center justify-center ${v.box}`}>{v.art}</div>
              <div className={`text-14 leading-tight font-bold ${v.muted ? "text-crown-muted" : ""}`}>
                {c.status === "upcoming" ? (
                  v.name
                ) : (
                  <Link href={`/seasons/${c.slug}`} className="hover:underline">
                    {v.name}
                  </Link>
                )}
              </div>
              <div className="text-12 leading-snug text-crown-muted">{v.sub}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ProfileView({ data, own }: { data: ProfilePage; own: boolean }) {
  const now = useServerNow(data.readAt);
  const goals = useGoals(data, now);
  const showReach = own && data.rank === "peasant";
  const showChronicle = data.showChronicle || own;

  return (
    <div className="flex min-h-dvh flex-col bg-crown-ink">
      <TopBar season={data.season} now={now} />
      <main className="flex-1">
        <Header data={data} own={own} />
        {own && (
          <div className="lg:hidden">
            <ComeBack data={data} now={now} />
          </div>
        )}
        {/* Mobile: one column in the design's order. */}
        <div className="flex flex-col lg:hidden">
          <Showcase data={data} own={own} goals={goals} />
          {showReach && <Reach goals={goals} />}
          <Deeds data={data} />
          <Rival data={data} own={own} />
          <Achievements data={data} />
          {showChronicle && <Chronicle data={data} now={now} />}
          <Collectibles data={data} own={own} />
        </div>
        {/* Desktop: main column and a 400 px side column. */}
        <div className="hidden grid-cols-[minmax(0,1fr)_400px] items-start gap-12 px-18 pt-12 pb-16 lg:grid">
          <div className="flex min-w-0 flex-col gap-12 [&>section]:shadow-none">
            {own && <ComeBack data={data} now={now} />}
            <Showcase data={data} own={own} goals={goals} />
            {showReach && <Reach goals={goals} />}
            <Achievements data={data} />
            {showChronicle && <Chronicle data={data} now={now} />}
          </div>
          <div className="flex flex-col gap-10 [&>section]:shadow-none">
            <Deeds data={data} />
            <Rival data={data} own={own} />
            <Collectibles data={data} own={own} />
          </div>
        </div>
      </main>
      <Footer season={data.season.id} now={now} />
    </div>
  );
}
