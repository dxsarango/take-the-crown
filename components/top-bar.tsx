"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { daysLeft } from "@/lib/format";
import type { Season } from "@/lib/home/data";
import { AccountMenu } from "./account-menu";
import { PersonIcon } from "./art";
import { useAuth } from "./auth/auth-provider";
import { LocaleSwitch } from "./locale-switch";

const NAV = [
  { href: "/", key: "throne" },
  { href: "/kingdom", key: "history" },
  { href: "/hall-of-fame", key: "hof" },
] as const;
export type TopBarSection = (typeof NAV)[number]["key"];

export function TopBar({ season, now, section, heading }: { season: Season; now: number; section?: TopBarSection; heading?: boolean }) {
  const t = useTranslations("season");
  const home = useTranslations("home");
  const realm = useTranslations("realm");
  const locale = useLocale() as Locale;
  const { viewer, ready, openLogin } = useAuth();
  const days = daysLeft(season.endsAt, now);
  const title = t("title", { n: season.id, name: season.name[locale] });

  return (
    <header className="flex h-14 items-center justify-between gap-2 bg-crown-velvet pr-3 pl-4 shadow-bar-bottom lg:h-18 lg:gap-6 lg:px-12">
      <div className="flex min-w-0 flex-col gap-[3px] lg:flex-row lg:items-center lg:gap-6">
        {heading ? (
          // The home page has no other title: the king's name below is a section heading.
          <h1 className="font-pixel text-20 leading-none font-bold whitespace-nowrap lg:text-28">
            <Link href="/">{BRAND_NAME}</Link>
          </h1>
        ) : (
          <Link href="/" className="font-pixel text-20 leading-none font-bold whitespace-nowrap lg:text-28">
            {BRAND_NAME}
          </Link>
        )}
        <div className="text-12 whitespace-nowrap text-crown-muted lg:hidden">{t("short", { n: season.id, days })}</div>
        {section && (
          <nav aria-label={realm("tabsLabel")} className="hidden h-18 gap-7 lg:flex">
            {NAV.map((item, i) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === section ? "page" : undefined}
                className={`flex items-center text-14 font-bold focus-visible:outline-offset-[-2px] ${
                  item.key === section ? "shadow-[inset_0_-4px_0_var(--crown-text)]" : "text-crown-muted hover:text-crown-text"
                }`}
              >
                {realm(`nav.${i}` as "nav.0")}
              </Link>
            ))}
          </nav>
        )}
        <div className="hidden h-7 items-center bg-crown-ink px-2.5 text-14 text-crown-muted lg:flex">
          {t("long", { season: title, days })}
        </div>
      </div>
      <div className="flex items-center gap-2 lg:gap-4">
        <LocaleSwitch />
        {viewer ? (
          <AccountMenu viewer={viewer} season={season.id} />
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
