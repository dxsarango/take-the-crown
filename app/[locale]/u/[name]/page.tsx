import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/profile/profile-view";
import { TimeZoneProvider } from "@/components/time-zone";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { currentViewer } from "@/lib/auth/viewer";
import { BRAND_NAME } from "@/lib/config/brand";
import { profileCard, shareMetadata } from "@/lib/og/metadata";
import { fetchProfilePage, profileIdForName } from "@/lib/profile/public";
import { publicClient } from "@/lib/supabase/public";
import { readerTimeZone } from "@/lib/time-zone.server";

// Rendered per request: the owner sees extra blocks (come back, goals, empty slots).
export const dynamic = "force-dynamic";

/** Link previews show a shared achievement (`?card=<code>`) or the player's latest reign. */
export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/u/[name]">): Promise<Metadata> {
  const { locale, name: raw } = await params;
  const name = decodeURIComponent(raw);
  const title = `${name} · ${BRAND_NAME}`;
  if (!hasLocale(routing.locales, locale)) return { title };
  const db = publicClient();
  const profileId = await profileIdForName(db, name);
  if (!profileId) return { title };
  const { card } = await searchParams;
  const share = await getTranslations({ locale, namespace: "share" });
  return shareMetadata({
    title,
    description: share("metaProfile", { name, brand: BRAND_NAME }),
    path: `/${locale}/u/${name.toLowerCase()}`,
    locale,
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
  if (!data) notFound();

  // Former names and other capitalizations land on the current, lowercased URL.
  const canonical = data.name.toLowerCase();
  if (name !== canonical) redirect({ href: `/u/${canonical}`, locale });

  return (
    <TimeZoneProvider timeZone={timeZone}>
      <ProfileView data={data} own={viewer?.profileId === profileId} />
    </TimeZoneProvider>
  );
}
