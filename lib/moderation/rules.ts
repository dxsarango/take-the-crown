/**
 * Deterministic moderation rules (SPEC §7), checked before the model: links must be plain https
 * addresses on a real domain, and never shorteners, chat invites or blocklisted domains. Messages
 * cannot carry links. Social links are held to their platform's domain by lib/profile/socials.ts.
 */

export const RULE_REASONS = ["not_https", "invalid_link", "shortener", "chat_invite", "blocked_domain", "link_in_message"] as const;
export type RuleReason = (typeof RULE_REASONS)[number];

/** Hide where a link goes. */
export const SHORTENERS = [
  "bit.ly",
  "bitly.com",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "v.gd",
  "cutt.ly",
  "rb.gy",
  "buff.ly",
  "shorturl.at",
  "tiny.cc",
  "rebrand.ly",
  "lnkd.in",
  "t.ly",
  "s.id",
  "bl.ink",
  "shorte.st",
  "adf.ly",
];

/** Pull readers into private chats, where scams happen out of sight. Host, optionally with a path prefix. */
export const CHAT_INVITES = [
  "t.me",
  "telegram.me",
  "telegram.dog",
  "discord.gg",
  "discord.com/invite",
  "discordapp.com/invite",
  "chat.whatsapp.com",
  "wa.me",
  "signal.group",
  "signal.me",
  "line.me",
  "kik.me",
];

/**
 * Maintained blocklist: domains that were abused or belong to categories the game never links to.
 * Add entries here (lowercase, no "www."); subdomains are covered.
 */
export const BLOCKED_DOMAINS = ["grabify.link", "iplogger.org", "iplogger.com", "2no.co", "blasze.tk"];

/** Words that, as a whole label or hyphenated part of the host, mark gambling or adult sites. */
const BLOCKED_HOST_WORDS = ["casino", "casinos", "slots", "poker", "betting", "sportsbook", "porn", "xxx", "onlyfans"];

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function matchesPrefix(host: string, path: string, entry: string): boolean {
  const [domain, ...rest] = entry.split("/");
  if (!matchesDomain(host, domain)) return false;
  const prefix = rest.length ? `/${rest.join("/")}` : "";
  return !prefix || path === prefix || path.startsWith(`${prefix}/`);
}

const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The first rule a link breaks, or null. */
export function linkProblem(raw: string): RuleReason | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid_link";
  }
  if (url.protocol !== "https:") return "not_https";
  // Credentials and ports disguise the real destination ("https://bank.com@evil.example").
  if (url.username || url.password || url.port) return "invalid_link";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!DOMAIN.test(host)) return "invalid_link";
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  if (SHORTENERS.some((d) => matchesDomain(host, d))) return "shortener";
  if (CHAT_INVITES.some((entry) => matchesPrefix(host, path, entry))) return "chat_invite";
  if (BLOCKED_DOMAINS.some((d) => matchesDomain(host, d))) return "blocked_domain";
  const words = host.split(/[.-]/);
  if (BLOCKED_HOST_WORDS.some((w) => words.includes(w))) return "blocked_domain";
  return null;
}

const URL_IN_TEXT =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|app|io|dev|co|so|ly|me|net|org|gg|link|xyz|info|site|shop|store|online|live)\b|\b(t\.me|wa\.me|discord\.gg)\b)/i;

/** Messages cannot carry links: they go in the link field, where the rules above apply. */
export function messageProblem(message: string): RuleReason | null {
  return URL_IN_TEXT.test(message) ? "link_in_message" : null;
}
