import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { publicClient } from "@/lib/supabase/public";

/**
 * "Season 3: March 2027" for cards and emails, from the season's names in the database (SPEC §12),
 * so provisional and renamed seasons need no copy change.
 */
export async function seasonTitle(seasonId: number, locale: Locale): Promise<string> {
  const [{ data }, t] = await Promise.all([
    publicClient().from("seasons").select("name_en, name_es").eq("id", seasonId).maybeSingle(),
    getTranslations({ locale, namespace: "season" }),
  ]);
  if (!data) return String(seasonId);
  return t("title", { n: seasonId, name: locale === "es" ? data.name_es : data.name_en });
}
