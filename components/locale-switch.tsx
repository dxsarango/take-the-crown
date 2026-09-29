"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitch() {
  const t = useTranslations("app");
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("language")} className="flex gap-0.5 bg-crown-ink p-0.5 lg:gap-1 lg:p-1">
      {routing.locales.map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            lang={locale}
            aria-current={active ? "true" : undefined}
            className={`hit-area flex h-7 min-w-11 items-center justify-center text-12 font-bold lg:h-8 lg:text-14 ${
              active
                ? "bg-crown-hall text-crown-text shadow-[inset_2px_2px_0_var(--crown-stone),inset_-2px_-2px_0_var(--crown-velvet)]"
                : "text-crown-muted"
            }`}
          >
            {t(`locales.${locale}`)}
          </Link>
        );
      })}
    </nav>
  );
}
