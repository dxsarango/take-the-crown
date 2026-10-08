# SEO audit

Goal: Google and AI answer engines understand what Take the Crown is, index the right pages in both languages, and show attractive results and link previews. Google's May 2026 guidance on generative AI features says optimizing for AI Overviews and AI Mode is still SEO: no special schema or files are required, structured data still matters for rich results, and unique, useful content is the main factor.

Output: `docs/audits/SEO-REPORT.md` with every item, status and evidence.

## Indexing and crawl

- Indexable: home, `/u/[name]` profiles, `/kingdom`, `/hall-of-fame`, `/seasons/[slug]`, `/rules`, `/faq`, `/terms`, `/privacy`, in `en` and `es`.
- Not indexable (`noindex` + disallowed in robots): `/admin`, `/settings/*`, `/api/*`, auth callbacks, unsubscribe pages, checkout return pages.
- Profiles: index only profiles with at least one reign and not deleted or banned; thin or empty profiles get `noindex` to avoid low-quality pages at scale.
- Sitemap index split by type (static pages, seasons, profiles), each URL with both locales and `lastmod`; regenerated as data changes; under 50,000 URLs per file.
- `robots.txt` points to the sitemap; no blocking of CSS, JS or images.
- Every page returns the right status: real 404s for unknown profiles and seasons (not soft 404s), 301/308 for renamed profiles to the current name.
- The root `/` redirect to a locale: decide between a 308 to the detected locale or serving `en` at `/` with `x-default`; make it consistent with hreflang.
- `www` and `*.vercel.app` redirect to the canonical domain.

## Internationalization

- `hreflang` for `en`, `es` and `x-default` on every indexable page, reciprocal and self-referencing, matching the sitemap.
- `<html lang>` correct per locale.
- Canonical URL per page and locale, absolute, pointing to itself (never the other language).
- Translated titles, descriptions and Open Graph text, not only body copy.

## Metadata per page

- Unique `<title>` (about 50 to 60 characters) and meta description (about 140 to 160) per page and locale, with the brand at the end of titles.
- Profiles: "{name}, {rank} — Take the Crown" style titles and a description with reigns and total time, generated from data.
- Seasons: season name, dates and King of the Season.
- Open Graph (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:locale` and `og:locale:alternate`) and X card (`summary_large_image`) on every indexable page. Default image for pages without a dynamic card; the existing share cards for profiles and seasons.
- Test link previews on X, WhatsApp, Telegram, Discord, LinkedIn and iMessage (debuggers where available).
- Favicon set and web manifest (in progress).

## Structured data (JSON-LD)

- `WebSite` with name and URL, and `Organization` with name, logo, URL, contact email and `sameAs` links to the official social accounts.
- `BreadcrumbList` on profiles, seasons and legal pages.
- `ProfilePage` with a `Person` main entity on public profiles (name, image, URL, social `sameAs` links the user chose to show).
- `FAQPage` markup is allowed but Google limits its rich result to a few sites; add it only if it costs nothing, and do not expect a rich result.
- `Event` for seasons only if it fits Google's guidelines; otherwise skip.
- Validate with the Rich Results Test and Schema.org validator; no markup for content not visible on the page.

## Content and on-page

- Each page has one clear `h1` and a logical heading order.
- The home explains in plain text, crawlable without JavaScript, what the game is, how the price works, and what you get. Today much of the home is visual; make sure a short descriptive block exists in the server-rendered HTML.
- Rules and FAQ written to answer real questions in full sentences (these are the passages AI answers quote).
- Images: `alt` text for meaningful images (current king, medals, avatars on profiles), empty `alt` for decoration.
- Internal links: home to kingdom, hall of fame, current season, rules; profiles to rivals and seasons; footer to legal pages.
- No important text inside images only.

## AI search and agents

- No `llms.txt` is required for Google; Google's teams gave mixed signals on it in 2026. Optional and cheap: add one later if it helps other assistants.
- Make sure AI crawlers are not accidentally blocked by Cloudflare's bot settings, unless the owner decides to block them. Decide explicitly and document it in `robots.txt` and Cloudflare.

## Measurement

- Google Search Console (domain property via DNS) and Bing Webmaster Tools: verify, submit the sitemap, watch indexing, Core Web Vitals and enhancements.
- Owner decision: privacy-friendly, cookieless analytics (for example Vercel Web Analytics or Plausible) to measure launch traffic. If added, update the privacy policy.

## References

- Google Search Central, optimizing for generative AI features (May 2026): https://developers.google.com/search
- Google structured data guidelines: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- Localized versions (hreflang): https://developers.google.com/search/docs/specialty/international/localized-versions
