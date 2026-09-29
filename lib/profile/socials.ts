/**
 * The seven optional profile links (decision 3). The form takes a handle or a pasted link; the
 * server stores one canonical https URL, which the database checks again (migration 0006).
 * Handle rules follow design/prototypes/social-lib.js; TikTok and website are additions.
 */
export const SOCIAL_KEYS = ["x", "ig", "tt", "yt", "gh", "li", "web"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

type Platform = {
  column: `link_${string}`;
  /** Shown before the input, and the canonical URL minus "https://". */
  host: string;
  /** Strips a pasted URL down to the handle. */
  strip: RegExp;
  valid: (handle: string) => boolean;
  /** "@" handles on platforms that show them that way. */
  at: boolean;
  /** Icon file in design/assets/icons/social. */
  icon: string;
};

const WEBSITE = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(\/[^\s]*)?$/;

export const PLATFORMS: Record<SocialKey, Platform> = {
  x: {
    column: "link_x",
    host: "x.com/",
    strip: /^(https?:\/\/)?(www\.|mobile\.)?(x|twitter)\.com\//i,
    valid: (h) => /^[A-Za-z0-9_]{1,15}$/.test(h),
    at: true,
    icon: "x",
  },
  ig: {
    column: "link_instagram",
    host: "instagram.com/",
    strip: /^(https?:\/\/)?(www\.)?instagram\.com\//i,
    valid: (h) => /^[A-Za-z0-9._]{1,30}$/.test(h) && !h.includes("..") && !h.startsWith(".") && !h.endsWith("."),
    at: true,
    icon: "instagram",
  },
  tt: {
    column: "link_tiktok",
    host: "tiktok.com/@",
    strip: /^(https?:\/\/)?(www\.|m\.)?tiktok\.com\/@?/i,
    valid: (h) => /^[A-Za-z0-9._]{2,24}$/.test(h),
    at: true,
    icon: "tiktok",
  },
  yt: {
    column: "link_youtube",
    host: "youtube.com/@",
    strip: /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/@?/i,
    valid: (h) => /^[A-Za-z0-9._-]{3,30}$/.test(h),
    at: true,
    icon: "youtube",
  },
  gh: {
    column: "link_github",
    host: "github.com/",
    strip: /^(https?:\/\/)?(www\.)?github\.com\//i,
    valid: (h) => /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(h),
    at: false,
    icon: "github",
  },
  li: {
    column: "link_linkedin",
    host: "linkedin.com/in/",
    strip: /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\//i,
    valid: (h) => /^[A-Za-z0-9-]{3,100}$/.test(h),
    at: false,
    icon: "linkedin",
  },
  web: {
    column: "link_website",
    host: "https://",
    strip: /^https?:\/\//i,
    valid: (h) => WEBSITE.test(h) && `https://${h}`.length <= 200,
    at: false,
    icon: "website",
  },
};

/** What the player typed, reduced to the handle (or, for the website, the address without https). */
export function cleanSocial(key: SocialKey, raw: string): string {
  const value = raw.trim();
  if (key === "web") return value.replace(PLATFORMS.web.strip, "").replace(/\/$/, "");
  return value.replace(PLATFORMS[key].strip, "").replace(/^@/, "").replace(/[/?#].*$/, "");
}

export function isValidSocial(key: SocialKey, raw: string): boolean {
  const handle = cleanSocial(key, raw);
  return handle === "" || PLATFORMS[key].valid(handle);
}

/** Canonical URL to store, or null when empty. Throws nothing: callers validate first. */
export function socialUrl(key: SocialKey, raw: string): string | null {
  const handle = cleanSocial(key, raw);
  return handle ? `https://${PLATFORMS[key].host.replace(/^https:\/\//, "")}${handle}` : null;
}

/** The stored URL back as the handle the form shows. */
export function socialHandle(key: SocialKey, url: string | null): string {
  if (!url) return "";
  return url.replace(/^https:\/\//, "").slice(PLATFORMS[key].host.replace(/^https:\/\//, "").length);
}

/** How a link reads on the profile: "@ana", "ana-codes", "ana.dev". */
export function socialLabel(key: SocialKey, url: string): string {
  const handle = socialHandle(key, url);
  return PLATFORMS[key].at ? `@${handle}` : handle;
}
