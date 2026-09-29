import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { HallView } from "@/components/realm/hall-view";
import { TimeZoneProvider } from "@/components/time-zone";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { fetchHallOfFame, fetchSeasons } from "@/lib/realm/data";
import { publicClient } from "@/lib/supabase/public";
import { readerTimeZone } from "@/lib/time-zone.server";

export async function generateMetadata({ params }: PageProps<"/[locale]/hall-of-fame">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "realm" });
  return { title: `${t("hofTitle")} · ${BRAND_NAME}` };
}

export default async function HallOfFamePage({ params }: PageProps<"/[locale]/hall-of-fame">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const db = publicClient();
  const { seasons, currentId } = await fetchSeasons(db);
  const current = seasons.find((s) => s.id === currentId);
  if (!current) notFound();
  const hall = await fetchHallOfFame(db, currentId);
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
