import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { KingdomView } from "@/components/realm/kingdom-view";
import { TimeZoneProvider } from "@/components/time-zone";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { fetchHistoryPage, fetchSeasonSummary, fetchSeasons } from "@/lib/realm/data";
import { publicClient } from "@/lib/supabase/public";
import { readerTimeZone } from "@/lib/time-zone.server";

export async function generateMetadata({ params }: PageProps<"/[locale]/kingdom">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "realm" });
  return { title: `${t("histTitle")} · ${BRAND_NAME}` };
}

export default async function KingdomPage({ params, searchParams }: PageProps<"/[locale]/kingdom">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const db = publicClient();
  const { seasons, currentId } = await fetchSeasons(db);
  const slug = (await searchParams).season;
  const selected = seasons.find((s) => (typeof slug === "string" ? s.slug === slug : s.id === currentId));
  // Seasons that have not started have no history yet.
  if (!selected || selected.id > currentId) notFound();

  const [entries, summary] = await Promise.all([fetchHistoryPage(db, selected.id), fetchSeasonSummary(db, selected.id)]);
  return (
    <TimeZoneProvider timeZone={await readerTimeZone()}>
      <KingdomView
        seasons={seasons}
        currentId={currentId}
        selected={selected}
        entries={entries}
        summary={summary}
        readAt={new Date().toISOString()}
      />
    </TimeZoneProvider>
  );
}
