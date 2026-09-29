import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { HomeView } from "@/components/home/home-view";
import { routing } from "@/i18n/routing";
import { fetchHomeData } from "@/lib/home/data";
import { publicClient } from "@/lib/supabase/public";

// ISR: traffic spikes hit the cached page; realtime keeps open tabs current (SPEC §6).
export const revalidate = 10;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const data = await fetchHomeData(publicClient());
  return <HomeView initial={data} />;
}
