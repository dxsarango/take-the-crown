"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { daysLeft } from "@/lib/format";
import type { Season } from "@/lib/home/data";
import { LocaleSwitch } from "./locale-switch";

export function TopBar({ season, now }: { season: Season; now: number }) {
  const t = useTranslations("season");
  const home = useTranslations("home");
  const locale = useLocale() as Locale;
  const days = daysLeft(season.endsAt, now);
  const title = t("title", { n: season.id, name: season.name[locale] });

  return (
    <header className="flex h-14 items-center justify-between gap-2 bg-crown-velvet pr-3 pl-4 shadow-bar-bottom lg:h-18 lg:gap-6 lg:px-12">
      <div className="flex min-w-0 flex-col gap-[3px] lg:flex-row lg:items-center lg:gap-6">
        {/* The design was drawn with a 5-letter brand; the full name needs a smaller size to fit 390 px. */}
        <div className="font-pixel text-16 leading-none font-bold whitespace-nowrap lg:text-28">{BRAND_NAME}</div>
        <div className="text-12 whitespace-nowrap text-crown-muted lg:hidden">{t("short", { n: season.id, days })}</div>
        <div className="hidden h-7 items-center bg-crown-ink px-2.5 text-14 text-crown-muted lg:flex">
          {t("long", { season: title, days })}
        </div>
      </div>
      <div className="flex items-center gap-2 lg:gap-4">
        <LocaleSwitch />
        {/* Sign-in ships in M5. */}
        <button
          type="button"
          className="hit-area m-1 h-9 bg-crown-hall px-3 text-14 font-bold whitespace-nowrap shadow-relief hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-ink lg:h-10 lg:px-4"
        >
          {home("signin")}
        </button>
      </div>
    </header>
  );
}
