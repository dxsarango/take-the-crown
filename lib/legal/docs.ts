import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { unstable_cache } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { serverEnv } from "@/lib/env.server";
import { formatPercent, formatPrice } from "@/lib/format";
import { publicClient } from "@/lib/supabase/public";
import type { LegalDoc } from "./docs-list";
import { type Block, fillPlaceholders, parseMarkdown } from "./markdown";

export { LEGAL_DOCS, type LegalDoc } from "./docs-list";

const DIR = path.join(process.cwd(), "docs", "legal");

const legalConfig = unstable_cache(readLegalConfig, ["legal-config"], { revalidate: 10 });

async function readLegalConfig() {
  const { data, error } = await publicClient()
    .from("app_config")
    .select(
      "floor_cents, step_bps, decay_bps_per_hour, lock_seconds, late_payment_grace_seconds, max_message_length, legal_contact_email, legal_city, legal_payment_provider, legal_effective_date",
    )
    .single();
  if (error || !data) throw new Error(`Could not read app_config: ${error?.message}`);
  return data;
}

function minutes(seconds: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "es" ? "es-419" : "en-US", { maximumFractionDigits: 1 }).format(seconds / 60);
}

/**
 * A legal page from docs/legal in the reader's language, with the brand, the domain, the legal
 * details from app_config (left as placeholders until the admin fills them in) and the live game
 * rules filled in.
 */
export async function legalDoc(doc: LegalDoc, locale: Locale): Promise<Block[]> {
  const [source, config] = await Promise.all([readFile(path.join(DIR, `${doc}.${locale}.md`), "utf8"), legalConfig()]);
  const date = config.legal_effective_date
    ? new Intl.DateTimeFormat(locale === "es" ? "es-419" : "en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${config.legal_effective_date}T00:00:00Z`))
    : null;
  return parseMarkdown(
    fillPlaceholders(source, {
      BRAND: BRAND_NAME,
      DOMAIN: new URL(serverEnv().NEXT_PUBLIC_SITE_URL).host,
      CONTACT_EMAIL: config.legal_contact_email,
      CITY: config.legal_city,
      PAYMENT_PROVIDER: config.legal_payment_provider,
      EFFECTIVE_DATE: date,
      floor: formatPrice(config.floor_cents, locale),
      step: formatPercent(config.step_bps, locale),
      decay: formatPercent(config.decay_bps_per_hour, locale),
      lock_minutes: minutes(config.lock_seconds, locale),
      grace_minutes: minutes(config.late_payment_grace_seconds, locale),
      max_message: String(config.max_message_length),
    }),
  );
}
