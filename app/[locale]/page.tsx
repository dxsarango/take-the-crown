import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { HomeView } from "@/components/home/home-view";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { fetchHomeData } from "@/lib/home/data";
import { shareMetadata } from "@/lib/og/metadata";
import { publicClient } from "@/lib/supabase/public";

// ISR: traffic spikes hit the cached page; realtime keeps open tabs current (SPEC §6).
export const revalidate = 10;

/** Link previews show the challenge card of the current king. */
export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "app" });
  const share = await getTranslations({ locale, namespace: "share" });
  const db = publicClient();
  const { data: crown } = await db.from("public_crown_state").select("current_reign_id").single();
  const reignId = crown?.current_reign_id ?? null;
  const { data: king } = reignId ? await db.from("public_reigns").select("name").eq("id", reignId).maybeSingle() : { data: null };
  return shareMetadata({
    title: BRAND_NAME,
    description: t("description"),
    path: `/${locale}`,
    locale,
    card: reignId ? { template: "challenge", id: String(reignId) } : null,
    alt: share("cardAlt", { name: king?.name ?? BRAND_NAME }),
  });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const data = await fetchHomeData(publicClient());
  return <HomeView initial={data} />;
}
