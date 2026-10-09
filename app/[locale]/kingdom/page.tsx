import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { KingdomView } from "@/components/realm/kingdom-view";
import { TimeZoneProvider } from "@/components/time-zone";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { shareMetadata } from "@/lib/og/metadata";
import { withBrand } from "@/lib/seo";
import { cachedSeasons } from "@/lib/home/cache";
import { fetchHistoryPage, fetchSeasonSummary } from "@/lib/realm/data";
import { publicClient } from "@/lib/supabase/public";
import { readerTimeZone } from "@/lib/time-zone.server";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/kingdom">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "seo" });
  const { seasons, currentId } = await cachedSeasons();
  const slug = (await searchParams).season;
  // Each season's history is its own page; the current one is the page without a parameter.
  const other = typeof slug === "string" ? seasons.find((s) => s.slug === slug && s.id !== currentId && s.id < currentId) : undefined;
  const title = other ? t("kingdomSeason.title", { number: other.id, name: other.name[locale] }) : t("kingdom.title");
  return shareMetadata({
    title: withBrand(title),
    description: t("kingdom.description", { brand: BRAND_NAME }),
    route: "/kingdom",
    query: other ? `?season=${other.slug}` : "",
    locale,
    card: null,
    alt: t("imageAlt"),
  });
}

export default async function KingdomPage({ params, searchParams }: PageProps<"/[locale]/kingdom">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const db = publicClient();
  const { seasons, currentId } = await cachedSeasons();
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
