import { z } from "zod";
import type { ModerationReason } from "@/lib/moderation/reasons";
import type { AvatarTraits } from "@/lib/art/avatar";
import { type AchievementCode, MEDAL_KEY } from "@/lib/game/achievements";
import { NAME_PATTERN, normalizeLink } from "@/lib/locks/input";
import { SOCIAL_KEYS, type SocialKey, isValidSocial, socialUrl } from "./socials";

export const LOCALES = ["en", "es"] as const;
export type SettingsLocale = (typeof LOCALES)[number];

/** Per-layer trait counts, mirroring PARTS in design/lib/avatar-lib.js and is_valid_avatar_traits. */
export const TRAIT_RANGES = {
  skin: [0, 5],
  hair: [0, 9],
  hc: [0, 7],
  fh: [0, 4],
  ex: [0, 5],
  cr: [0, 2],
  cape: [0, 4],
  cc: [0, 4],
  acc: [-1, 5],
  bg: [0, 4],
} as const satisfies Record<keyof AvatarTraits, readonly [number, number]>;
export type TraitKey = keyof typeof TRAIT_RANGES;
export const TRAIT_KEYS = Object.keys(TRAIT_RANGES) as TraitKey[];

/** The edit profile form, exactly as the browser holds it. */
export type SettingsForm = {
  avatarMode: "generated" | "upload";
  avatarTraits: AvatarTraits;
  avatarPath: string | null;
  avatarPixelated: boolean;
  name: string;
  country: string | null;
  link: string;
  socials: Record<SocialKey, string>;
  showcase: AchievementCode[];
  showRival: boolean;
  showChronicle: boolean;
  alertsDethroned: boolean;
  priceOn: boolean;
  /** Whole dollars as typed. */
  price: string;
  alertsSeasonStart: boolean;
  locale: SettingsLocale;
};

export type FieldKey = "up" | "name" | "link" | `soc_${SocialKey}` | "price";

const WEB_ADDRESS = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

/** Product link as stored: https, whatever the player typed. */
export function mainLinkUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  return normalizeLink(value.replace(/^http:\/\//i, "https://"));
}

export type FieldProblem =
  | { field: "name"; problem: "short" | "chars" }
  | { field: "link"; problem: "bad" }
  | { field: `soc_${SocialKey}`; problem: "bad" }
  | { field: "price"; problem: "range" }
  | { field: "up"; problem: "none" };

/** Checks the form can be sent; name availability and moderation are answered by the server. */
export function formProblems(form: SettingsForm, floorDollars: number): FieldProblem[] {
  const problems: FieldProblem[] = [];
  if (form.avatarMode === "upload" && !form.avatarPath) problems.push({ field: "up", problem: "none" });
  const name = form.name.trim();
  if (name.length < 3) problems.push({ field: "name", problem: "short" });
  else if (!NAME_PATTERN.test(name)) problems.push({ field: "name", problem: "chars" });
  const link = form.link.trim();
  if (link && (!WEB_ADDRESS.test(link) || (mainLinkUrl(link)?.length ?? 0) > 200)) problems.push({ field: "link", problem: "bad" });
  for (const key of SOCIAL_KEYS) {
    if (!isValidSocial(key, form.socials[key])) problems.push({ field: `soc_${key}`, problem: "bad" });
  }
  if (form.priceOn) {
    const value = form.price.trim();
    if (!/^\d+$/.test(value) || Number(value) < floorDollars || Number(value) > 999) problems.push({ field: "price", problem: "range" });
  }
  return problems;
}

const achievementCodes = Object.keys(MEDAL_KEY) as [AchievementCode, ...AchievementCode[]];

/** PATCH /api/profile body. */
export const settingsSchema = z.object({
  avatarMode: z.enum(["generated", "upload"]),
  avatarTraits: z.object(
    Object.fromEntries(TRAIT_KEYS.map((k) => [k, z.number().int().min(TRAIT_RANGES[k][0]).max(TRAIT_RANGES[k][1])])) as Record<
      TraitKey,
      z.ZodNumber
    >,
  ),
  avatarPath: z.string().max(80).nullable(),
  avatarPixelated: z.boolean(),
  name: z.string().trim().regex(NAME_PATTERN),
  country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  link: z.string().max(200),
  socials: z.object(Object.fromEntries(SOCIAL_KEYS.map((k) => [k, z.string().max(200)])) as Record<SocialKey, z.ZodString>),
  showcase: z.array(z.enum(achievementCodes)).max(3),
  showRival: z.boolean(),
  showChronicle: z.boolean(),
  alertsDethroned: z.boolean(),
  priceOn: z.boolean(),
  price: z.string().max(3),
  alertsSeasonStart: z.boolean(),
  locale: z.enum(LOCALES),
});

/** Arguments for update_profile, or the fields that are not valid. */
export function toUpdateArgs(
  profileId: string,
  form: SettingsForm,
  floorDollars: number,
): { problems: FieldProblem[] } | { args: Record<string, unknown> } {
  const problems = formProblems(form, floorDollars);
  if (problems.length) return { problems };
  const link = (key: SocialKey) => socialUrl(key, form.socials[key]);
  return {
    args: {
      p_profile_id: profileId,
      p_name: form.name.trim(),
      p_country_code: form.country,
      p_main_link: mainLinkUrl(form.link),
      p_link_website: link("web"),
      p_link_x: link("x"),
      p_link_youtube: link("yt"),
      p_link_tiktok: link("tt"),
      p_link_instagram: link("ig"),
      p_link_github: link("gh"),
      p_link_linkedin: link("li"),
      p_avatar_mode: form.avatarMode,
      p_avatar_path: form.avatarPath,
      p_avatar_pixelated: form.avatarPixelated,
      p_avatar_traits: form.avatarTraits,
      p_showcase: form.showcase,
      p_show_rival: form.showRival,
      p_show_chronicle: form.showChronicle,
      p_alerts_dethroned: form.alertsDethroned,
      p_alerts_price_below_cents: form.priceOn ? Number(form.price.trim()) * 100 : null,
      p_alerts_season_start: form.alertsSeasonStart,
      p_locale: form.locale,
    },
  };
}

/** What PATCH /api/profile answers. */
export type SaveOutcome =
  | { ok: true }
  | { ok: false; error: "invalid"; fields: FieldKey[]; nameProblem?: "taken" | "cooldown" }
  | { ok: false; error: "rejected"; field: "name" | "link"; reason: ModerationReason }
  | { ok: false; error: "moderation_unavailable" }
  | { ok: false; error: "failed" };

/** Maps an update_profile error to the field it concerns. */
export function fieldForDbError(message: string): { field: FieldKey; nameProblem?: "taken" | "cooldown" } | null {
  if (message.includes("name_taken")) return { field: "name", nameProblem: "taken" };
  if (message.includes("name_change_too_soon")) return { field: "name", nameProblem: "cooldown" };
  if (message.includes("name_invalid")) return { field: "name" };
  if (message.includes("avatar_invalid")) return { field: "up" };
  if (message.includes("alert_price_invalid")) return { field: "price" };
  if (message.includes("profiles_main_link_format")) return { field: "link" };
  const social: Record<string, SocialKey> = {
    profiles_link_x_format: "x",
    profiles_link_instagram_format: "ig",
    profiles_link_tiktok_format: "tt",
    profiles_link_youtube_format: "yt",
    profiles_link_github_format: "gh",
    profiles_link_linkedin_format: "li",
    profiles_link_website_format: "web",
  };
  for (const [constraint, key] of Object.entries(social)) {
    if (message.includes(constraint)) return { field: `soc_${key}` };
  }
  return null;
}
