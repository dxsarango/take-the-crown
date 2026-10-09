import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { JsonLdScript } from "@/components/json-ld";
import { ProfileView } from "@/components/profile/profile-view";
import { TimeZoneProvider } from "@/components/time-zone";
import { permanentRedirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { currentViewer } from "@/lib/auth/viewer";
import { formatDuration } from "@/lib/format";
import { rankForSeconds } from "@/lib/game/rank";
import { shareMetadata } from "@/lib/og/metadata";
import { cachedProfile, cachedProfileCard, cachedProfileId } from "@/lib/profile/cache";
import { siteUrl } from "@/lib/site";
import { NOINDEX, isProfileIndexable, withBrand } from "@/lib/seo";
import { breadcrumbs, profilePage } from "@/lib/seo-jsonld";
import { readerTimeZone } from "@/lib/time-zone.server";
import { isFormerName } from "@/lib/game/former";

// Rendered per request: the owner sees extra blocks (come back, goals, empty slots).
export const dynamic = "force-dynamic";

/** Link previews show a shared achievement (`?card=<code>`) or the player's latest reign. */
export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/u/[name]">): Promise<Metadata> {
  const { locale, name: raw } = await params;
  const name = decodeURIComponent(raw);
  if (!hasLocale(routing.locales, locale)) return { title: withBrand(name) };
  const profileId = await cachedProfileId(name);
  if (!profileId) return { title: withBrand(name) };
  const { card } = await searchParams;
  const [t, share, rankT, common, { page, banned }] = await Promise.all([
    getTranslations({ locale, namespace: "seo" }),
    getTranslations({ locale, namespace: "share" }),
    getTranslations({ locale, namespace: "rank" }),
    getTranslations({ locale, namespace: "common" }),
    cachedProfile(profileId),
  ]);
  const totalSeconds = page?.stats.totalSeconds ?? 0;
  const rank = rankT(rankForSeconds(totalSeconds));
  const crowns = page?.stats.crowns ?? 0;
  const units = { h: common("units.h"), m: common("units.m"), s: common("units.s") };
  const meta = shareMetadata({
    title: withBrand(t("profile.title", { name, rank })),
    description: crowns
      ? t("profile.description", { brand: BRAND_NAME, name, rank, crowns, duration: formatDuration(totalSeconds, units) })
      : t("profile.descriptionNew", { brand: BRAND_NAME, name }),
    // The URL a former name or another capitalization lands on.
    route: `/u/${name.toLowerCase()}`,
    locale,
    // A shared card (?card=) changes the preview image, not the page: the canonical never carries it.
    card: await cachedProfileCard(profileId, card),
    alt: share("cardAlt", { name }),
  });
  return isProfileIndexable({ crowns, suspended: banned }) ? meta : { ...meta, robots: NOINDEX };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/u/[name]">) {
  const { locale, name: raw } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const name = decodeURIComponent(raw);
  const profileId = await cachedProfileId(name);
  if (!profileId) notFound();

  const [{ page, banned }, viewer, timeZone] = await Promise.all([cachedProfile(profileId), currentViewer(), readerTimeZone()]);
  // A deleted account keeps its reigns in the record but has no profile page.
  if (!page || isFormerName(page.name)) notFound();
  // Live durations count from this request, not from when the cached data was read.
  const data = { ...page, readAt: new Date().toISOString() };

  // Former names and other capitalizations land on the current, lowercased URL.
  const canonical = data.name.toLowerCase();
  if (name !== canonical) permanentRedirect({ href: `/u/${canonical}`, locale });

  // The same rule as the robots tag: only a player who reigned and is not suspended is described to search engines.
  const indexable = isProfileIndexable({ crowns: data.stats.crowns, suspended: banned });
  const site = siteUrl();
  return (
    <TimeZoneProvider timeZone={timeZone}>
      {indexable && (
        <>
          <JsonLdScript
            data={profilePage({
              site,
              locale,
              route: `/u/${canonical}`,
              name: data.name,
              joinedAt: data.joinedAt,
              image: data.avatar.image?.originalUrl ?? null,
              // Only the links the page shows.
              sameAs: [...data.socials.map((s) => s.url), data.mainLink],
            })}
          />
          <JsonLdScript
            data={breadcrumbs({
              site,
              locale,
              trail: [
                { name: BRAND_NAME, route: "" },
                { name: data.name, route: `/u/${canonical}` },
              ],
            })}
          />
        </>
      )}
      <ProfileView data={data} own={viewer?.profileId === profileId} />
    </TimeZoneProvider>
  );
}
