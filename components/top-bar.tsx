"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { daysLeft } from "@/lib/format";
import type { Season } from "@/lib/home/data";
import { PersonIcon, Portrait } from "./art";
import { useAuth } from "./auth/auth-provider";
import { LocaleSwitch } from "./locale-switch";

export function TopBar({ season, now }: { season: Season; now: number }) {
  const t = useTranslations("season");
  const home = useTranslations("home");
  const login = useTranslations("login");
  const locale = useLocale() as Locale;
  const { viewer, ready, openLogin } = useAuth();
  const days = daysLeft(season.endsAt, now);
  const title = t("title", { n: season.id, name: season.name[locale] });

  return (
    <header className="flex h-14 items-center justify-between gap-2 bg-crown-velvet pr-3 pl-4 shadow-bar-bottom lg:h-18 lg:gap-6 lg:px-12">
      <div className="flex min-w-0 flex-col gap-[3px] lg:flex-row lg:items-center lg:gap-6">
        <Link href="/" className="font-pixel text-20 leading-none font-bold whitespace-nowrap lg:text-28">
          {BRAND_NAME}
        </Link>
        <div className="text-12 whitespace-nowrap text-crown-muted lg:hidden">{t("short", { n: season.id, days })}</div>
        <div className="hidden h-7 items-center bg-crown-ink px-2.5 text-14 text-crown-muted lg:flex">
          {t("long", { season: title, days })}
        </div>
      </div>
      <div className="flex items-center gap-2 lg:gap-4">
        <LocaleSwitch />
        {viewer ? (
          <Link
            href={`/u/${viewer.name.toLowerCase()}`}
            aria-label={login("yourProfile")}
            title={viewer.name}
            className="hit-area flex items-center gap-3 focus-visible:outline-offset-2"
          >
            <span className="hidden max-w-40 truncate text-14 font-bold lg:block">{viewer.name}</span>
            <Portrait avatar={viewer.avatar} rank={viewer.rank} season={season.id} crown={false} scale={1} />
          </Link>
        ) : (
          // On mobile Sign in is an icon so the full brand fits at the design's size (decision 20).
          <>
            <button
              type="button"
              onClick={() => openLogin()}
              disabled={!ready}
              aria-label={home("signin")}
              title={home("signin")}
              className="hit-area m-1 flex size-9 items-center justify-center bg-crown-hall shadow-relief hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-ink lg:hidden"
            >
              <PersonIcon />
            </button>
            <button
              type="button"
              onClick={() => openLogin()}
              disabled={!ready}
              className="hit-area m-1 hidden h-10 bg-crown-hall px-4 text-14 font-bold whitespace-nowrap shadow-relief hover:bg-crown-stone focus-visible:outline-offset-[6px] active:bg-crown-ink lg:block"
            >
              {home("signin")}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
