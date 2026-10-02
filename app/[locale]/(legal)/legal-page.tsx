import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LegalView } from "@/components/legal/legal-view";
import { routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { type LegalDoc, legalDoc } from "@/lib/legal/docs";
import { fetchSeasons } from "@/lib/realm/data";
import { publicClient } from "@/lib/supabase/public";

type Props = { params: Promise<{ locale: string }> };

export async function legalMetadata(doc: LegalDoc, { params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const title = (await legalDoc(doc, locale)).find((b) => b.kind === "title");
  return {
    title: `${title?.kind === "title" ? title.text : doc} · ${BRAND_NAME}`,
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/${doc}`])) },
  };
}

/** /rules, /faq, /terms and /privacy, rendered from docs/legal (SPEC §14). */
export async function LegalPage({ doc, params }: Props & { doc: LegalDoc }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Per request: the CSP nonce, and the legal details and rules as the admin last set them.
  await connection();
  const [blocks, { seasons, currentId }] = await Promise.all([legalDoc(doc, locale), fetchSeasons(publicClient())]);
  const season = seasons.find((s) => s.id === currentId);
  if (!season) notFound();
  return <LegalView doc={doc} blocks={blocks} season={season} readAt={new Date().toISOString()} />;
}
