import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/profile/profile-view";
import { TimeZoneProvider } from "@/components/time-zone";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { currentViewer } from "@/lib/auth/viewer";
import { formatDuration } from "@/lib/format";
import { rankForSeconds } from "@/lib/game/rank";
import { profileCard, shareMetadata } from "@/lib/og/metadata";
import { withBrand } from "@/lib/seo";
import { fetchProfilePage, profileIdForName } from "@/lib/profile/public";
import { publicClient } from "@/lib/supabase/public";
import { readerTimeZone } from "@/lib/time-zone.server";
import { isFormerName } from "@/lib/game/former";

// Rendered per request: the owner sees extra blocks (come back, goals, empty slots).
export const dynamic = "force-dynamic";

/** Link previews show a shared achievement (`?card=<code>`) or the player's latest reign. */
export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/u/[name]">): Promise<Metadata> {
  const { locale, name: raw } = await params;
  const name = decodeURIComponent(raw);
  if (!hasLocale(routing.locales, locale)) return { title: withBrand(name) };
  const db = publicClient();
  const profileId = await profileIdForName(db, name);
  if (!profileId) return { title: withBrand(name) };
  const { card } = await searchParams;
  const [t, share, rankT, common] = await Promise.all([
    getTranslations({ locale, namespace: "seo" }),
    getTranslations({ locale, namespace: "share" }),
    getTranslations({ locale, namespace: "rank" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const { data: stats } = await db.from("profile_stats").select("crowns_taken, total_reign_seconds").eq("profile_id", profileId).maybeSingle();
  const rank = rankT(rankForSeconds(stats?.total_reign_seconds ?? 0));
  const crowns = stats?.crowns_taken ?? 0;
  const units = { h: common("units.h"), m: common("units.m"), s: common("units.s") };
  return shareMetadata({
    title: withBrand(t("profile.title", { name, rank })),
    description: crowns
      ? t("profile.description", { brand: BRAND_NAME, name, rank, crowns, duration: formatDuration(Number(stats?.total_reign_seconds ?? 0), units) })
      : t("profile.descriptionNew", { brand: BRAND_NAME, name }),
    // The URL a former name or another capitalization lands on.
    route: `/u/${name.toLowerCase()}`,
    locale,
    // A shared card (?card=) changes the preview image, not the page: the canonical never carries it.
    card: await profileCard(db, profileId, typeof card === "string" ? card : undefined),
    alt: share("cardAlt", { name }),
  });
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/u/[name]">) {
  const { locale, name: raw } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const name = decodeURIComponent(raw);
  const db = publicClient();
  const profileId = await profileIdForName(db, name);
  if (!profileId) notFound();

  const [data, viewer, timeZone] = await Promise.all([fetchProfilePage(db, profileId), currentViewer(), readerTimeZone()]);
  // A deleted account keeps its reigns in the record but has no profile page.
  if (!data || isFormerName(data.name)) notFound();

  // Former names and other capitalizations land on the current, lowercased URL.
  const canonical = data.name.toLowerCase();
  if (name !== canonical) redirect({ href: `/u/${canonical}`, locale });

  return (
    <TimeZoneProvider timeZone={timeZone}>
      <ProfileView data={data} own={viewer?.profileId === profileId} />
    </TimeZoneProvider>
  );
}
