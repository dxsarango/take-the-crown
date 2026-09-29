import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { SeasonView } from "@/components/realm/season-view";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { fetchSeasonEnd, fetchSeasons } from "@/lib/realm/data";
import { publicClient } from "@/lib/supabase/public";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]/seasons/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const { seasons } = await fetchSeasons(publicClient());
  const season = seasons.find((s) => s.slug === slug);
  if (!season || !hasLocale(routing.locales, locale)) return {};
  return { title: `${season.name[locale]} · ${BRAND_NAME}` };
}

export default async function SeasonPage({ params }: PageProps<"/[locale]/seasons/[slug]">) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const db = publicClient();
  const [data, { seasons, currentId }] = await Promise.all([fetchSeasonEnd(db, slug), fetchSeasons(db)]);
  // Only seasons that have started have a page.
  const current = seasons.find((s) => s.id === currentId);
  if (!data || !current) notFound();
  return <SeasonView data={data} current={current} readAt={new Date().toISOString()} />;
}
