import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { HomeView } from "@/components/home/home-view";
import { routing } from "@/i18n/routing";
import { JsonLdScript } from "@/components/json-ld";
import { BRAND_NAME, OFFICIAL_PROFILES } from "@/lib/config/brand";
import { siteUrl } from "@/lib/site";
import { siteAndOrganization } from "@/lib/seo-jsonld";
import { playerName } from "@/lib/game/former";
import { cachedContactEmail, cachedHomeData } from "@/lib/home/cache";
import { shareMetadata } from "@/lib/og/metadata";
import { NOINDEX, isCheckoutReturn, withBrand } from "@/lib/seo";

/** Link previews show the challenge card of the current king. */
export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "seo" });
  const share = await getTranslations({ locale, namespace: "share" });
  const common = await getTranslations({ locale, namespace: "common" });
  const { crown, king } = await cachedHomeData();
  const reignId = crown.currentReignId;
  const meta = shareMetadata({
    title: withBrand(t("home.title")),
    description: t("home.description", { brand: BRAND_NAME }),
    route: "",
    locale,
    card: reignId ? { template: "challenge", id: String(reignId) } : null,
    alt: share("cardAlt", { name: king ? playerName(king.name, common("formerKing")) : BRAND_NAME }),
  });
  // Coming back from checkout (`?lock=`) shows the same page: keep it out of the index.
  return isCheckoutReturn(await searchParams) ? { ...meta, robots: NOINDEX } : meta;
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // Rendered per request for the CSP nonce; the data comes from the cache.
  await connection();
  const [data, contactEmail] = await Promise.all([cachedHomeData(), cachedContactEmail()]);
  return (
    <>
      <JsonLdScript
        data={siteAndOrganization({
          site: siteUrl(),
          locale,
          brand: BRAND_NAME,
          contactEmail: contactEmail,
          sameAs: OFFICIAL_PROFILES,
        })}
      />
      <HomeView initial={data} />
    </>
  );
}
