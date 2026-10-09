import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { JsonLdScript } from "@/components/json-ld";
import { LegalView } from "@/components/legal/legal-view";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { type LegalDoc, legalDoc } from "@/lib/legal/docs";
import { shareMetadata } from "@/lib/og/metadata";
import { cachedSeasons } from "@/lib/home/cache";
import { siteUrl } from "@/lib/site";
import { withBrand } from "@/lib/seo";
import { breadcrumbs, faqPage, questionsOf } from "@/lib/seo-jsonld";

type Props = { params: Promise<{ locale: string }> };

export async function legalMetadata(doc: LegalDoc, { params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "seo" });
  return shareMetadata({
    title: withBrand(t(`${doc}.title`)),
    description: t(`${doc}.description`, { brand: BRAND_NAME }),
    route: `/${doc}`,
    locale,
    card: null,
    alt: t("imageAlt"),
  });
}

/** /rules, /faq, /terms and /privacy, rendered from docs/legal (SPEC §14). */
export async function LegalPage({ doc, params }: Props & { doc: LegalDoc }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Per request: the CSP nonce, and the legal details and rules as the admin last set them.
  await connection();
  const [blocks, { seasons, currentId }] = await Promise.all([legalDoc(doc, locale), cachedSeasons()]);
  const season = seasons.find((s) => s.id === currentId);
  if (!season) notFound();
  const site = siteUrl();
  const heading = blocks.find((b) => b.kind === "title");
  return (
    <>
      <JsonLdScript
        data={breadcrumbs({
          site,
          locale,
          trail: [
            { name: BRAND_NAME, route: "" },
            { name: heading?.kind === "title" ? heading.text : doc, route: `/${doc}` },
          ],
        })}
      />
      {doc === "faq" && <JsonLdScript data={faqPage({ site, locale, route: "/faq", questions: questionsOf(blocks) })} />}
      <LegalView doc={doc} blocks={blocks} season={season} readAt={new Date().toISOString()} />
    </>
  );
}
