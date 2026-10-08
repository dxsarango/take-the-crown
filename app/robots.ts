import type { MetadataRoute } from "next";
import { serverEnv } from "@/lib/env.server";

// Never crawled: private areas and handlers. Pages, styles, scripts, images and share cards are open.
const DISALLOW = ["/api/", "/auth/", "/*/admin", "/*/settings/", "/*/alerts/"];

// AI crawlers and agents, named so the decision is on the page: they are allowed, like any other
// crawler, so the game can be found and quoted by answer engines. To block one, move its name to
// a group with `disallow: "/"` here and in Cloudflare (Security → Bots → AI crawlers).
const AI_CRAWLERS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  const site = serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      // A named group replaces the general one for that crawler, so the private paths repeat.
      { userAgent: AI_CRAWLERS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
