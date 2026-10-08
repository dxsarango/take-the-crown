import "server-only";
import type { Metadata } from "next";
import { type Locale, routing } from "@/i18n/routing";
import { BRAND_NAME } from "@/lib/config/brand";
import { isAchievementCode } from "@/lib/game/achievements";
import { isRank } from "@/lib/game/rank";
import { OG_LOCALE, alternatesFor } from "@/lib/seo";
import type { PublicClient } from "@/lib/supabase/public";
import { CARD_SIZES, type CardTemplate } from "./data";

export type CardRef = { template: CardTemplate; id: string };

export function cardPath(card: CardRef, locale: Locale, size: "og" | "story" = "og"): string {
  const params = new URLSearchParams({ locale, ...(size === "og" ? {} : { size }) });
  return `/og/${card.template}/${encodeURIComponent(card.id)}?${params}`;
}

/** Pages without a dynamic share card preview with the crown icon. */
const DEFAULT_IMAGE = { url: "/icons/icon-512.png", width: 512, height: 512 };

/**
 * Canonical URL, hreflang set, Open Graph and X card tags of an indexable page. The image is the
 * page's share card when it has one, else the crown icon. `route` is the path without its locale.
 */
export function shareMetadata(input: {
  title: string;
  description: string;
  route: string;
  query?: string;
  locale: Locale;
  card: CardRef | null;
  alt: string;
}): Metadata {
  const alternates = alternatesFor(input.locale, input.route, input.query);
  const images = input.card
    ? [{ url: cardPath(input.card, input.locale), width: CARD_SIZES.og.width, height: CARD_SIZES.og.height, alt: input.alt }]
    : [{ ...DEFAULT_IMAGE, alt: input.alt }];
  return {
    title: input.title,
    description: input.description,
    alternates,
    openGraph: {
      title: input.title,
      description: input.description,
      url: alternates.canonical as string,
      siteName: BRAND_NAME,
      locale: OG_LOCALE[input.locale],
      alternateLocale: routing.locales.filter((l) => l !== input.locale).map((l) => OG_LOCALE[l]),
      type: "website",
      images,
    },
    twitter: {
      card: input.card ? "summary_large_image" : "summary",
      title: input.title,
      description: input.description,
      images: images.map((i) => i.url),
    },
  };
}

/**
 * The card a profile link previews: a shared achievement or rank (`?card=<code or rank>`) if the player has it,
 * else their current reign, else their last reign (dethroned or not).
 */
export async function profileCard(db: PublicClient, profileId: string, requested: string | undefined): Promise<CardRef | null> {
  if (requested && isAchievementCode(requested)) {
    const { data } = await db
      .from("profile_achievements")
      .select("achievement_code")
      .eq("profile_id", profileId)
      .eq("achievement_code", requested)
      .maybeSingle();
    if (data) return { template: "achievement", id: `${profileId}_${requested}` };
  }
  if (requested && isRank(requested)) {
    const { data } = await db.from("rank_ups").select("rank").eq("profile_id", profileId).eq("rank", requested).maybeSingle();
    if (data) return { template: "rank", id: `${profileId}_${requested}` };
  }
  const { data: last } = await db
    .from("public_reigns")
    .select("id, ended_at, dethroned_by")
    .eq("profile_id", profileId)
    .eq("reversed", false)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last?.id) return null;
  return { template: last.ended_at && last.dethroned_by ? "dethroned" : "victory", id: String(last.id) };
}

/** The King of the Season's longest reign that season. */
export async function seasonCard(db: PublicClient, seasonId: number, kingProfileId: string | null): Promise<CardRef | null> {
  if (!kingProfileId) return null;
  const { data } = await db
    .from("public_reigns")
    .select("id")
    .eq("season_id", seasonId)
    .eq("profile_id", kingProfileId)
    .eq("reversed", false)
    .order("duration_seconds", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? { template: "victory", id: String(data.id) } : null;
}
