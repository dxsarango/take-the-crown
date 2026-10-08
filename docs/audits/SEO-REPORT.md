# SEO audit report

Audit of `docs/audits/SEO.md`, run on 2026-10-08 against `main` at `38f1490`. Everything was checked against a local production build (`next build` and `next start` with `NEXT_PUBLIC_SITE_URL=https://takethecrown.app`) and the local database with the throne-room seed. Nothing was scanned, crawled or load-tested in production; the commands for the owner are at the end.

Statuses: **verified** (with the test or evidence), **fixed** (with the PR and its tests), **finding (low)** (listed for the owner, not fixed), **skipped** (with the reason), **owner** (needs an account or a decision; in the checklist at the end).

The fixes are four stacked PRs, because they touch the same page files. Merge them in this order: [#53](https://github.com/dxsarango/take-the-crown/pull/53), [#54](https://github.com/dxsarango/take-the-crown/pull/54), [#55](https://github.com/dxsarango/take-the-crown/pull/55), [#56](https://github.com/dxsarango/take-the-crown/pull/56), then this report. None of them has a migration. After each one merges, rebase the next onto `main`.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| S1 | High | No canonical URL on any page, and `hreflang` only on the four legal pages (without `x-default`): the two languages could compete, and `?season=`, `?card=` and `?utm=` variants were all separate pages | fixed, [#53](https://github.com/dxsarango/take-the-crown/pull/53) |
| S2 | Medium | The home page had no text explaining the game, and its only `h1` (twice, mobile and desktop) was the king's name | fixed, [#56](https://github.com/dxsarango/take-the-crown/pull/56) |
| S3 | Medium | Titles and descriptions were thin or shared: the home title was only the brand, and kingdom, hall of fame, rules, faq, terms and privacy all used the home description | fixed, [#53](https://github.com/dxsarango/take-the-crown/pull/53) |
| S4 | Medium | Kingdom, hall of fame and the legal pages had no Open Graph or X tags; no page had `og:locale:alternate`; pages without a share card had no image | fixed, [#53](https://github.com/dxsarango/take-the-crown/pull/53) |
| S5 | Medium | The sitemap listed only the seven static pages, only the English URL of each, without `lastmod`; no seasons, no players, no index | fixed, [#54](https://github.com/dxsarango/take-the-crown/pull/54) |
| S6 | Medium | Profiles with no reigns or suspended accounts were indexable, and so was the home page with `?lock=` (back from checkout) | fixed, [#54](https://github.com/dxsarango/take-the-crown/pull/54) |
| S7 | Medium | A renamed profile, or another capitalization, answered a temporary redirect (307) instead of a permanent one | fixed, [#54](https://github.com/dxsarango/take-the-crown/pull/54) |
| S8 | Medium | No structured data at all | fixed, [#55](https://github.com/dxsarango/take-the-crown/pull/55) |
| S9 | Low | The home page did not link to the current season or the rules (only the footer did); profiles did not link to their rival or their seasons | fixed with S2, [#56](https://github.com/dxsarango/take-the-crown/pull/56) |
| S10, S12–S15 | Low | See "Low findings" | listed |
| S11 | Low | The manifest's `maskable` icons were the plain icons. They were already inside the safe zone (the crown's farthest corner sat at 36% of the side, the limit is 40%), so nothing was cropped, but the files were shared and the margin was not checked | fixed: `pnpm favicons` writes `icon-192-maskable.png` and `icon-512-maskable.png` at the largest integer scale that fits, and a unit test measures it |

## Indexing and crawl

- **Indexable pages — verified.** Home, profiles, `/kingdom`, `/hall-of-fame`, `/seasons/[slug]`, `/rules`, `/faq`, `/terms`, `/privacy`, in `en` and `es`, all answer 200, carry a canonical to themselves and no `robots` tag. `e2e/seo-indexing.spec.ts` ("every listed URL is served, canonical to itself, and not noindex") fetches every URL of every sitemap file and checks that.
- **Not indexable — verified.** `/admin` answers 404 with `noindex` to anyone who is not an admin; `/settings/profile` redirects a signed-out visitor and is `noindex`; `/alerts/off` (unsubscribe) is `noindex, nofollow`; `/api/*`, `/auth/*`, `/*/admin`, `/*/settings/` and `/*/alerts/` are disallowed in `robots.txt`. Checkout return pages (`/en?lock=…`, with or without `cancelled=1`) are `noindex` and keep `/en` as canonical (S6). Tests: `e2e/seo-indexing.spec.ts` ("which pages are indexed", "robots.txt …").
- **Thin profiles — fixed (S6).** A profile is indexed only if its player has at least one reign and is not suspended; a deleted player already answers 404. The rule is one function (`isProfileIndexable`) used by the robots tag, the sitemap and the structured data. Tests: unit `tests/unit/sitemap.test.ts`, e2e "a player with reigns is, an empty or suspended profile is not".
- **Sitemaps — fixed (S5).** `/sitemap.xml` is an index; `/sitemaps/static.xml` (seven pages), `/sitemaps/seasons.xml` (started seasons) and `/sitemaps/profiles-N.xml` (20,000 players per file, so at most 40,000 URLs, under Google's 50,000). Every page is listed once per language, each entry names all versions and `x-default`, and has a `lastmod` (latest reign activity; the legal pages use the legal date or the last settings change). Cached for an hour at the edge and invalidated with the home data (a takeover). Tests: unit (XML, escaping, chunking, `lastmod`), e2e (index, files, which players are listed, 404 for files that do not exist).
- **`robots.txt` — verified, plus a decision.** It points to `https://takethecrown.app/sitemap.xml` and blocks only the private paths; scripts, styles, images, avatars and share cards stay open (the e2e checks that no asset path is disallowed). The AI crawlers (search and retrieval: `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, `PerplexityBot`, `Perplexity-User`; training: `GPTBot`, `ClaudeBot`, `Google-Extended`, `Applebot-Extended`, `CCBot`) are now named in a group of their own and allowed, so the decision is written down. To block one, move it to a group with `disallow: "/"` and do the same in Cloudflare (owner checklist).
- **Status codes — verified.** Unknown profiles and seasons, seasons that have not started and unknown paths answer a real 404 with `noindex` (not a soft 404): `e2e/seo-indexing.spec.ts` ("private and unknown pages answer with their own status and noindex"). Another capitalization (`/es/u/VALERUIZ`) and a former name (`/es/u/old_vale`) answer **308** to the current lowercase name (S7); before, 307. A trailing slash answers 308 (Next). An unknown language prefix (`/xx/kingdom`) goes through one extra redirect to a 404 (S12).
- **The root `/` — decision, verified.** It stays a temporary redirect (307) that follows `Accept-Language`: the answer depends on the visitor, so a 308 would be cached by browsers and pin people to a language. Crawlers send no language and land on `/en`. `x-default` is `/en`, a page that answers 200 (before, next-intl's `Link` header on the redirect named `/` as `x-default`; that header is switched off with `alternateLinks: false` because the tags and the sitemap carry the same information). Test: "the root picks a language with a temporary redirect and no hreflang header".
- **`www` and `*.vercel.app` — verified.** The app redirects every host that is not `NEXT_PUBLIC_SITE_URL`'s to the canonical domain with a 308, crons excepted (security audit L9, PR #49; `tests/unit/canonical-host.test.ts` and `e2e/canonical-host.spec.ts` against a production build). `DEPLOY.md` also has `www` redirect to the apex in Vercel.

## Internationalization

- **`hreflang` — fixed (S1).** Every indexable page declares `en`, `es` and `x-default` (the English page), absolute, reciprocal, self-referencing, the same set as the sitemap. Both `e2e/seo-metadata.spec.ts` (18 page and language combinations) and `e2e/seo-indexing.spec.ts` compare them.
- **`<html lang>` — verified** on every page and language in `e2e/seo-metadata.spec.ts`.
- **Canonical — fixed (S1).** One per page and language, absolute (through `metadataBase`), to itself, never to the other language. `/kingdom?season=<past season>` is its own canonical page (it shows that season's history); `?season=<current season>`, `?card=`, `?utm=` and `?lock=` are never part of a canonical. Test: "a season's history is its own page, and an ignored parameter is not".
- **Translated metadata — fixed (S3, S4).** Titles, descriptions and Open Graph text come from the `seo` messages in both languages; a unit test keeps their sizes in range and different from each other.

## Metadata per page

- **Titles and descriptions — fixed (S3).** Every title is unique per page and language and ends with the brand; the unit test keeps titles between 45 and 65 characters and descriptions between 120 and 165 (the audit asks for about 50 to 60 and about 140 to 160). Profiles read "{name}, {rank} — Take the Crown" with "{name} is a {rank} on Take the Crown, with N reigns and 85h 41m on the throne…" generated from `profile_stats`; seasons carry the number, name, start and end dates and, when there is one, the King of the Season. Brand names come from `{brand}`, never typed into the messages.
- **Open Graph and X — fixed (S4).** `og:title`, `og:description`, `og:image` (+ size and alt), `og:url`, `og:type`, `og:site_name`, `og:locale` and `og:locale:alternate`, and `twitter:card` with title, description and image, on every indexable page. Profiles and seasons use the existing share cards (1200×630, `summary_large_image`); the home uses the king's challenge card; pages without a card use the crown icon (`summary`). Tests: unit (`tests/unit/seo.test.ts`) and e2e on the real HTML.
- **Link previews on X, WhatsApp, Telegram, Discord, LinkedIn and iMessage — owner.** They need the live site and the platforms' debuggers; the list is in the commands at the end.
- **Favicon set and web manifest — verified.** The head carries `icon.svg`, 16 and 32 px PNGs, the 180 px `apple-touch-icon` and `/manifest.webmanifest` (name, colors, 192 and 512 icons). The maskable entries had reused the plain icons; they now have files of their own (S11).

## Structured data

- **`WebSite` and `Organization` — fixed (S8).** On the home page, in a `@graph`: name, URL per language, `inLanguage`, logo (512 px icon), and the contact email from the legal settings once it is set. `sameAs` comes from `OFFICIAL_PROFILES` in `lib/config/brand.ts`, which is empty: no account is invented (owner checklist).
- **`BreadcrumbList` — fixed (S8)** on profiles (home → player), seasons (home → history → season) and the four legal pages.
- **`ProfilePage` with a `Person` — fixed (S8).** Name, URL, the uploaded photo when there is one, `dateCreated`, and `sameAs` with only the links the page shows (the product link and the social links the player chose), https only, without repeats. Only for players who are indexed; a profile that is not gets none.
- **`FAQPage` — fixed (S8).** Built from the questions the FAQ page shows, at no cost; do not expect a rich result.
- **`Event` — skipped.** A season is not an event with a place and a date that Google would list; the guidelines say to skip it otherwise.
- **Validation and visibility — verified locally.** `tests/unit/jsonld.test.ts` checks every builder's shape and that user text cannot close the block (`<`, `>`, `&`, U+2028 and U+2029 are escaped; the JSON parses back unchanged). `e2e/seo-structured-data.spec.ts` reads the real HTML: the FAQ questions it lists all appear on the page, no markup for what is not visible, no markup on pages that are not indexed, and no Content-Security-Policy violation (a data block is never executed, so the nonce policy does not apply; the security spec skips `application/ld+json` blocks). The Rich Results Test and the Schema.org validator run on a public URL: owner (commands below). `dangerouslySetInnerHTML` is used only for this block, with the serializer above, after the security audit's rule about user data.

## Content and on-page

- **One clear `h1` and heading order — fixed (S2).** Every page has one `h1`; the home page's is now the brand in the top bar, and the king's name and the empty-throne headline are `h2`. Legal pages already had one `h1` and questions as `h2`. The responsive layouts render the mobile and the desktop version of some blocks, each with its own headings; only one is visible, so a browser and a screen reader see one (S10).
- **A crawlable description on the home page — fixed (S2).** A "How it works" section, in the server-rendered HTML, says what the game is, how the price moves (the drop and the floor come from the live settings) and what a player gets. Test: `e2e/seo-content.spec.ts` reads the HTML without running scripts, in both languages. Checked at 390 px and 1440 px against the existing section style.
- **Rules and FAQ — verified.** The FAQ is eleven questions answered in full sentences ("Can I get a refund? Purchases are final once you get the crown…"); the rules have sections for the crown, the price, what you can post, ranks, achievements, seasons and fair play. They are the passages an answer engine would quote; nothing to change.
- **Images — verified.** The only `<img>` elements are flags, medals, pixel art and avatar photos, always next to the name they illustrate (the medal's name, the player's name, the country text), so an empty `alt` is right for them; portraits are inline SVG hidden from assistive technology. The pages' meaningful images are the share cards, which have `og:image:alt`. A page with a missing `alt` attribute: none (checked on the home and a profile).
- **Internal links — fixed (S9).** The home page links to the history, the hall of fame, the current season and the rules in the new section (the footer keeps rules, FAQ, terms and privacy); a profile links to its rival and to the season pages of its collectibles, and every page links to the legal pages from the footer. Language links are plain `<a href>`.
- **No important text only in images — verified.** Prices, names, times and every piece of copy are text; the share cards repeat what the page says.

## AI search and agents

- **`llms.txt` — skipped.** Not required by Google and optional elsewhere; nothing breaks without it (S14).
- **AI crawlers — fixed in `robots.txt`, owner in Cloudflare.** The decision is explicit (allowed, named) in `app/robots.ts`. Cloudflare can still block them before they reach the app: check that "Block AI bots" / AI Crawl Control allows them and that Cloudflare's managed `robots.txt` does not add its own rules (checklist and commands below). Bot Fight Mode is already off (`DEPLOY.md`).

## Measurement

- **Search Console and Bing Webmaster Tools — owner.** The sitemap to submit is `https://takethecrown.app/sitemap.xml`.
- **Analytics — owner decision.** If a cookieless tool is added, the privacy policy changes (`docs/legal/privacy.*.md`).

## Low findings

| # | Finding | Recommendation |
|---|---|---|
| S10 | Several blocks render a mobile and a desktop version in the same HTML (the profile has two `h1`, two "Achievements" sections…), so a crawler reads some content twice | Harmless for ranking today; if it matters, render one version and size it with CSS, which is a design-wide refactor |
| S12 | An unknown language prefix (`/xx/kingdom`) redirects to `/en/xx/kingdom` before the 404 | Harmless; a locale-aware 404 for unknown prefixes would save the hop |
| S13 | The sitemap reads every reign (1,000 rows a request) to compute `lastmod`; fine at launch and cached for an hour | Past about 100,000 reigns, replace it with a SQL function that returns one row per player |
| S14 | No `llms.txt` | Add one later if another assistant benefits; optional |
| S15 | `Person.image` is only set for uploaded photos; a generated pixel avatar has no URL | Fine; a rendered avatar URL could be added if Google starts asking |

Also found, not SEO: two e2e specs depend on the time of day and fail when run at certain hours: `first-takeover.spec.ts` (en) between about 00:00 and 05:00 local time, because the `night_owl` medal is then awarded to the buyer. It fails on `main` too. The realm spec had the same kind of problem and was fixed in #51.

## Commands for the owner

Run these yourself against production; none of them was run from this machine.

```bash
# Tags of each page: canonical, hreflang, robots, Open Graph, structured data
curl -s https://takethecrown.app/en | grep -oE '<(title|link rel="(canonical|alternate)"|meta (name="(description|robots)"|property="og:[a-z:]+"))[^>]*>?[^<]{0,120}'
curl -s https://takethecrown.app/es/u/<a-player> | grep -c 'application/ld+json'

# Status codes and redirects
curl -sI https://takethecrown.app/en/u/nobody | head -1            # 404
curl -sI https://takethecrown.app/es/u/<A-PLAYER> | grep -iE '^(HTTP|location)'   # 308 to the lowercase name
curl -sI https://takethecrown.app/ -H 'Accept-Language: es' | grep -iE '^(HTTP|location)'   # 307 to /es
curl -sI https://www.takethecrown.app/en | grep -iE '^(HTTP|location)'              # 308 to the apex
curl -sI https://<the-project>.vercel.app/en | grep -iE '^(HTTP|location)'          # 308 to the domain

# Sitemaps and robots
curl -s https://takethecrown.app/robots.txt
curl -s https://takethecrown.app/sitemap.xml
curl -s https://takethecrown.app/sitemaps/static.xml | head -20

# AI crawlers must reach the pages: expect 200, not 403 or a challenge page
for bot in GPTBot OAI-SearchBot ClaudeBot Claude-SearchBot PerplexityBot Google-Extended; do
  echo "$bot $(curl -s -o /dev/null -w '%{http_code}' -A "$bot" https://takethecrown.app/en)"
done

# Lighthouse (SEO, accessibility, performance) on a phone and on a desktop
npx lighthouse https://takethecrown.app/en --only-categories=seo,accessibility,performance --output=html --output-path=./lighthouse-en.html
npx lighthouse https://takethecrown.app/en/u/<a-player> --only-categories=seo --preset=desktop --output=html --output-path=./lighthouse-profile.html
```

Tools to open in the browser, with a live URL (a player's profile, a season, the FAQ and the home page, in both languages):

- Rich Results Test: `https://search.google.com/test/rich-results` (profile page, breadcrumbs, FAQ).
- Schema.org validator: `https://validator.schema.org/`.
- Facebook Sharing Debugger: `https://developers.facebook.com/tools/debug/` (also what WhatsApp and iMessage read).
- LinkedIn Post Inspector: `https://www.linkedin.com/post-inspector/`.
- X: paste the URL in the post composer to see the card (the Card Validator no longer exists).
- Telegram: send the URL to `@WebpageBot` to refresh its cache, then to yourself.
- Discord: paste the URL in a private channel.
- Google Search Console → URL Inspection, after the property is verified.

## Owner checklist

- [ ] Merge #53 → #54 → #55 → #56, rebasing each onto `main` after the one before it merges; then this report. No migration, nothing to push to Supabase.
- [ ] Google Search Console: add a **domain** property for `takethecrown.app` (DNS TXT record in Cloudflare), then Sitemaps → submit `https://takethecrown.app/sitemap.xml`; watch Pages (indexing), Core Web Vitals and Enhancements (breadcrumbs, profile page, FAQ).
- [ ] Bing Webmaster Tools: import the site from Search Console and submit the same sitemap.
- [ ] `/admin`: set the legal contact email (it becomes the `Organization` email in the structured data) and the effective date (it becomes the `lastmod` of the legal pages).
- [ ] Official social accounts: when they exist, add their https URLs to `OFFICIAL_PROFILES` in `lib/config/brand.ts` (they become `sameAs`).
- [ ] Cloudflare → Security → Bots: confirm Bot Fight Mode is off and that "Block AI bots" / AI Crawl Control does not block the crawlers `app/robots.ts` allows (or block them in both places); if Cloudflare's "Manage your robots.txt" is on, make sure it does not prepend rules that contradict ours. Run the `GPTBot`/`ClaudeBot` curl above.
- [ ] Vercel → Domains: `www.takethecrown.app` redirects (308) to the apex; do not redirect `*.vercel.app` there (the app does it, crons excepted).
- [ ] Decision: privacy-friendly analytics (Vercel Web Analytics or Plausible) for launch traffic. If you add one, update the privacy policy in both languages first.
- [ ] After the deploy: run the commands above, the Rich Results Test and Schema.org validator on the live URLs, and the link-preview debuggers; re-share a link in each app because they cache the first preview.
- [ ] Optional: decide on S14 (`llms.txt`); decided not to add it.
