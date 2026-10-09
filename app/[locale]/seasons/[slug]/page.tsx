import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { JsonLdScript } from "@/components/json-ld";
import { SeasonView } from "@/components/realm/season-view";
import { TimeZoneProvider } from "@/components/time-zone";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { seasonCard, shareMetadata } from "@/lib/og/metadata";
import { cachedSeasons } from "@/lib/home/cache";
import { fetchSeasonEnd } from "@/lib/realm/data";
import { siteUrl } from "@/lib/site";
import { withBrand } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-jsonld";
import { publicClient } from "@/lib/supabase/public";
import { readerTimeZone } from "@/lib/time-zone.server";

export async function generateMetadata({ params }: PageProps<"/[locale]/seasons/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const db = publicClient();
  const { seasons, currentId } = await cachedSeasons();
  const season = seasons.find((s) => s.slug === slug);
  if (!season || !hasLocale(routing.locales, locale)) return {};
  const [t, share] = await Promise.all([getTranslations({ locale, namespace: "seo" }), getTranslations({ locale, namespace: "share" })]);
  const king = season.kingProfileId ? (await db.from("profiles").select("name").eq("id", season.kingProfileId).maybeSingle()).data?.name : undefined;
  const ended = season.closedAt !== null || season.id < currentId;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  return shareMetadata({
    title: withBrand(t("season.title", { number: season.id, name: season.name[locale] })),
    description: t("season.description", {
      number: season.id,
      name: season.name[locale],
      start: date.format(new Date(season.startsAt)),
      end: date.format(new Date(season.endsAt)),
      state: king ? (ended ? "ended" : "held") : "other",
      king: king ?? "",
      brand: BRAND_NAME,
    }),
    route: `/seasons/${slug}`,
    locale,
    card: await seasonCard(db, season.id, season.kingProfileId),
    alt: share("cardAlt", { name: season.name[locale] }),
  });
}

export default async function SeasonPage({ params }: PageProps<"/[locale]/seasons/[slug]">) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const db = publicClient();
  const [data, { seasons, currentId }] = await Promise.all([fetchSeasonEnd(db, slug), cachedSeasons()]);
  // Only seasons that have started have a page.
  const current = seasons.find((s) => s.id === currentId);
  if (!data || !current) notFound();
  const realm = await getTranslations({ locale, namespace: "realm" });
  return (
    <TimeZoneProvider timeZone={await readerTimeZone()}>
      <JsonLdScript
        data={breadcrumbs({
          site: siteUrl(),
          locale,
          trail: [
            { name: BRAND_NAME, route: "" },
            { name: realm("histTitle"), route: "/kingdom" },
            { name: data.season.name[locale], route: `/seasons/${slug}` },
          ],
        })}
      />
      <SeasonView data={data} current={current} readAt={new Date().toISOString()} />
    </TimeZoneProvider>
  );
}
