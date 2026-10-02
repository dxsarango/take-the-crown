import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { EditProfile } from "@/components/settings/edit-profile";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { currentViewer } from "@/lib/auth/viewer";
import { BRAND_NAME } from "@/lib/config/brand";
import { COUNTRY_CODES, countryName } from "@/lib/countries";
import { fetchOwnSettings } from "@/lib/profile/own";
import { publicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/settings/profile">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "editProfile" });
  return { title: `${t("title")} · ${BRAND_NAME}`, robots: { index: false } };
}

export default async function EditProfilePage({ params, searchParams }: PageProps<"/[locale]/settings/profile">) {
  const { locale } = await params;
  // Back from the sign-in link that confirms an account deletion.
  const openDelete = (await searchParams).delete === "1";
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const viewer = await currentViewer();
  // Signed out: the home opens the sign-in sheet and comes back here afterwards.
  if (!viewer) redirect({ href: `/?login=${encodeURIComponent(`/${locale}/settings/profile`)}`, locale });

  const [settings, seasonRes] = await Promise.all([
    fetchOwnSettings(viewer!.profileId),
    publicClient().from("crown_state").select("season_id, seasons(id, slug, name_en, name_es, starts_at, ends_at)").single(),
  ]);
  const seasonRow = seasonRes.data?.seasons;
  if (!settings || !seasonRow) notFound();

  const season = {
    id: seasonRow.id,
    slug: seasonRow.slug,
    name: { en: seasonRow.name_en, es: seasonRow.name_es },
    startsAt: seasonRow.starts_at,
    endsAt: seasonRow.ends_at,
  };
  const designNames = (await getMessages({ locale })).country as Record<string, string>;
  const countries = COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale, designNames) })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );
  return <EditProfile settings={settings} season={season} readAt={settings.readAt} countries={countries} openDelete={openDelete} />;
}
