"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { DropArrow, Flag, Icon, RankTag } from "@/components/art";
import type { Locale } from "@/i18n/routing";
import { clockParts, displayLink, formatCountdown, formatPercent, formatPrice } from "@/lib/format";
import type { CrownState, King } from "@/lib/home/data";
import { type HeroState, lockSegments } from "@/lib/home/hero";

/** Shown after the buyer's own payment attempt fails or their lock runs out (design states 4 and 5). */
export type HomeNotice = "payment_failed" | "lock_expired";

type Props = {
  king: King | null;
  crown: CrownState;
  state: HeroState;
  season: number;
  notice: HomeNotice | null;
  onTake: () => void;
};

const LOCK_SEGMENTS = 20;

function Clock({ seconds, muted = false }: { seconds: number; muted?: boolean }) {
  const t = useTranslations("common.units");
  const parts = clockParts(seconds);
  return (
    <div className="flex items-baseline gap-3.5 lg:gap-4">
      {(["h", "m", "s"] as const).map((unit) => (
        <div key={unit} className="flex items-baseline gap-0.5">
          <span className={`font-pixel text-64 leading-none font-bold tabular-nums ${muted ? "text-crown-muted" : ""}`}>
            {parts[unit]}
          </span>
          <span className="font-pixel text-28 font-medium text-crown-muted">{t(unit)}</span>
        </div>
      ))}
    </div>
  );
}

function KingName({ king, size }: { king: King; size: "mobile" | "desktop" }) {
  const rank = useTranslations("rank");
  return (
    <div className={`flex flex-wrap items-center ${size === "mobile" ? "gap-2.5" : "gap-3"}`}>
      <h1 className={size === "mobile" ? "text-20 font-bold" : "text-28 leading-tight font-bold"}>{king.name}</h1>
      <Flag code={king.countryCode} className="shadow-[0_0_0_2px_var(--crown-velvet)]" />
      <RankTag rank={king.rank} label={rank(king.rank)} />
    </div>
  );
}

function PriceNotes({ mode, crown, locale }: { mode: HeroState["mode"]; crown: CrownState; locale: Locale }) {
  const common = useTranslations("common");
  const states = useTranslations("homeStates");
  const floor = common("floor", { price: formatPrice(crown.floorCents, locale) });
  const [icon, first, second] = ((): [ReactNode, string, string] => {
    switch (mode) {
      case "locked":
        return [<Icon key="i" name="pause" size={14} />, states("onHold"), floor];
      case "empty":
        return [<Icon key="i" name="up" size={14} />, states("opening"), states("rises")];
      case "floor":
        return [<Icon key="i" name="floor" size={14} className="text-crown-gold" />, states("floorHit"), states("noLower")];
      default:
        return [
          <DropArrow key="i" />,
          common("dropping", { percent: formatPercent(crown.decayBpsPerHour, locale) }),
          floor,
        ];
    }
  })();
  return (
    <div className="flex flex-col items-end gap-[3px] text-right">
      <div className="flex items-center gap-2 text-14 font-medium">
        {icon}
        {first}
      </div>
      <div className="text-12 text-crown-muted">{second}</div>
    </div>
  );
}

function Price({ cents, locale }: { cents: number; locale: Locale }) {
  return <div className="font-pixel text-40 leading-none font-bold text-crown-gold">{formatPrice(cents, locale)}</div>;
}

function FloorTag() {
  const t = useTranslations("homeStates");
  return (
    <span className="flex h-7 items-center rounded-tag border border-crown-gold px-2 font-pixel text-14 font-medium whitespace-nowrap text-crown-gold">
      {t("lowest")}
    </span>
  );
}

function TakeButton({ label, onClick, className = "" }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hit-area m-1 h-14 bg-crown-gold text-18 font-bold text-crown-ink shadow-relief-gold hover:bg-crown-gold-glow hover:shadow-relief-gold-hover focus-visible:outline-offset-[6px] active:bg-crown-gold-old active:pt-1 active:shadow-relief-gold-pressed ${className}`}
    >
      {label}
    </button>
  );
}

function Reserved({ secondsLeft, lockSeconds, align }: { secondsLeft: number; lockSeconds: number; align: "left" | "right" }) {
  const t = useTranslations("homeStates");
  const lit = lockSegments(secondsLeft, lockSeconds, LOCK_SEGMENTS);
  return (
    <div className="flex flex-col gap-2" role="status">
      <div className="m-1 flex h-14 items-center justify-between gap-3 bg-crown-velvet px-4 shadow-[0_0_0_4px_var(--crown-hall)] lg:px-5">
        <span className="text-16 font-bold">{t("someone")}</span>
        <span className="font-pixel text-28 font-bold tabular-nums">{formatCountdown(secondsLeft)}</span>
      </div>
      <div className="mx-1 flex gap-0.5" aria-hidden>
        {Array.from({ length: LOCK_SEGMENTS }, (_, i) => (
          <span key={i} className={`h-1 flex-1 ${i < lit ? "bg-crown-muted" : "bg-crown-hall"}`} />
        ))}
      </div>
      <p className={`mx-1 text-12 leading-snug text-crown-muted ${align === "right" ? "text-right" : ""}`}>
        {t("reservedNote")}
      </p>
    </div>
  );
}

export function KingMessage({ king, size }: { king: King; size: "mobile" | "desktop" }) {
  const home = useTranslations("home");
  const common = useTranslations("common");
  if (!king.message && !king.link) return null;
  return (
    <>
      {king.message && (
        <p className={size === "mobile" ? "text-16 leading-body text-pretty" : "max-w-[440px] text-20 leading-snug font-medium text-pretty"}>
          {home("quote", { message: king.message })}
        </p>
      )}
      <div className={`flex items-center gap-3 ${size === "mobile" ? "justify-between" : "lg:gap-4"}`}>
        {king.link ? (
          <a
            href={king.link}
            target="_blank"
            rel="sponsored ugc noopener"
            className={`hit-area font-bold underline decoration-crown-stone decoration-2 underline-offset-[5px] hover:decoration-crown-text ${size === "mobile" ? "text-14" : "text-16"}`}
          >
            {displayLink(king.link)}
          </a>
        ) : (
          <span />
        )}
        {/* Reporting ships in M7. */}
        <button
          type="button"
          className="hit-area h-8 px-2 text-12 font-medium text-crown-muted hover:bg-crown-velvet hover:text-crown-text"
        >
          {common("report")}
        </button>
      </div>
    </>
  );
}

function Notice({ notice, priceCents, locale }: { notice: HomeNotice; priceCents: number; locale: Locale }) {
  const t = useTranslations("homeStates");
  const [title, body] =
    notice === "payment_failed"
      ? [t("payErr1"), t("payErr2")]
      : [t("exp1"), t("exp2", { price: formatPrice(priceCents, locale) })];
  return (
    <div role="alert" className="flex items-start gap-3 bg-crown-velvet px-3.5 py-3 shadow-flag-danger lg:w-[400px] lg:px-4">
      <span className="flex size-6 flex-none items-center justify-center bg-crown-danger text-crown-ink">
        <Icon name={notice === "payment_failed" ? "bang" : "glass"} size={16} />
      </span>
      <div className="flex flex-col gap-0.5 text-14 leading-snug">
        <div className="font-bold">{title}</div>
        <div className="text-crown-muted">{body}</div>
      </div>
    </div>
  );
}

export function Hero({ king, crown, state, season, notice, onTake }: Props) {
  const locale = useLocale() as Locale;
  const common = useTranslations("common");
  const home = useTranslations("home");
  const states = useTranslations("homeStates");
  const price = formatPrice(state.priceCents, locale);
  const buttonLabel = state.mode === "empty" ? states("takeFirst", { price }) : common("take", { price });
  const locked = state.mode === "locked";
  const showNotice = notice !== null && !locked;

  return (
    <>
      {/* Mobile: name → clock → price + button. */}
      <div className="flex flex-col gap-4 px-4 pt-4 pb-6 lg:hidden">
        {king ? (
          <>
            <KingName king={king} size="mobile" />
            <div className="flex flex-col gap-1">
              <div className="text-14 text-crown-muted">{home("reigning")}</div>
              <Clock seconds={state.reignSeconds} />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1.5 pt-1 pb-2">
            <h1 className="text-28 leading-[1.15] font-bold">{states("empty1")}</h1>
            <p className="text-16 leading-body text-crown-muted">{states("empty2", { n: season })}</p>
          </div>
        )}
        {showNotice ? (
          <Notice notice={notice} priceCents={state.priceCents} locale={locale} />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Price cents={state.priceCents} locale={locale} />
              {state.mode === "floor" && <FloorTag />}
            </div>
            <PriceNotes mode={state.mode} crown={crown} locale={locale} />
          </div>
        )}
        {locked ? (
          <Reserved secondsLeft={state.lockSecondsLeft} lockSeconds={crown.lockSeconds} align="left" />
        ) : (
          <TakeButton label={buttonLabel} onClick={onTake} />
        )}
      </div>

      {/* Desktop: king | clock | price + button. */}
      <div className="hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-12 px-18 pt-8 pb-14 lg:grid">
        <div className="flex min-w-0 flex-col gap-3">
          {king ? (
            <>
              <KingName king={king} size="desktop" />
              <KingMessage king={king} size="desktop" />
            </>
          ) : (
            <>
              <h1 className="max-w-[460px] text-40 leading-tight font-bold">{states("empty1")}</h1>
              <p className="text-20 leading-snug font-medium text-crown-muted">{states("empty2", { n: season })}</p>
            </>
          )}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="text-16 text-crown-muted">{king ? home("reigning") : states("noKing")}</div>
          <Clock seconds={state.reignSeconds} muted={!king} />
        </div>
        <div className="flex flex-col items-end gap-4">
          {showNotice ? (
            <Notice notice={notice} priceCents={state.priceCents} locale={locale} />
          ) : (
            <div className="flex items-center gap-5">
              <PriceNotes mode={state.mode} crown={crown} locale={locale} />
              {state.mode === "floor" && <FloorTag />}
              <Price cents={state.priceCents} locale={locale} />
            </div>
          )}
          {locked ? (
            <div className="w-[400px]">
              <Reserved secondsLeft={state.lockSecondsLeft} lockSeconds={crown.lockSeconds} align="right" />
            </div>
          ) : (
            <TakeButton label={buttonLabel} onClick={onTake} className={king ? "min-w-[340px] px-7" : "min-w-[400px] px-7"} />
          )}
        </div>
      </div>
    </>
  );
}
