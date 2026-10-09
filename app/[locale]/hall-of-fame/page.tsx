import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { HallView } from "@/components/realm/hall-view";
import { TimeZoneProvider } from "@/components/time-zone";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { shareMetadata } from "@/lib/og/metadata";
import { withBrand } from "@/lib/seo";
import { cachedSeasons } from "@/lib/home/cache";
import { cachedHallOfFame } from "@/lib/realm/cache";
import { readerTimeZone } from "@/lib/time-zone.server";

export async function generateMetadata({ params }: PageProps<"/[locale]/hall-of-fame">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "seo" });
  return shareMetadata({
    title: withBrand(t("hallOfFame.title")),
    description: t("hallOfFame.description", { brand: BRAND_NAME }),
    route: "/hall-of-fame",
    locale,
    card: null,
    alt: t("imageAlt"),
  });
}

export default async function HallOfFamePage({ params }: PageProps<"/[locale]/hall-of-fame">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const { seasons, currentId } = await cachedSeasons();
  const current = seasons.find((s) => s.id === currentId);
  if (!current) notFound();
  const hall = await cachedHallOfFame(currentId);
  return (
    <TimeZoneProvider timeZone={await readerTimeZone()}>
      <HallView
        current={current}
        next={seasons.find((s) => s.id === currentId + 1) ?? null}
        manySeasons={currentId > 0}
        hall={hall}
        readAt={new Date().toISOString()}
      />
    </TimeZoneProvider>
  );
}
