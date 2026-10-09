# Performance audit report

Audit of `docs/audits/PERFORMANCE.md`, run on 2026-10-09 against `main` at `053af75`. Everything was measured on a local production build (`next build` and `next start`) with the local Supabase database; Lighthouse 12 ran in mobile emulation with its default simulated throttling. Nothing was scanned or load-tested in production. The commands for the owner are at the end.

Statuses: **verified** (with the evidence), **fixed** (with the PR and its tests), **open** (a finding that is not fixed yet, with the reason), **finding (low)** (listed for the owner), **owner** (needs an account or a decision; in the checklist at the end).

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| P1 | High | The hall of fame read every row of `season_leaderboard`, `country_leaderboard` and `public_reigns` and ranked them in the server on every request. PostgREST cuts an answer at 1,000 rows, so past that size the records were picked from an arbitrary part of the data: wrong results, not only slow ones | fixed, [#68](https://github.com/dxsarango/take-the-crown/pull/68) (migration 0033) |
| P2 | High | Every crown or event change made every open home page run the home queries (5 + 2 reads) straight against Supabase: a crowd of N viewers multiplied the database load by N at the busiest moment. If realtime failed (plan limit), pages stayed frozen | fixed, [#67](https://github.com/dxsarango/take-the-crown/pull/67) |
| P3 | Medium | The Supabase client (about 160 KB gzip, 40% of the page's JavaScript) shipped on every page, including the legal pages, because the clock hook shared a module with the realtime code; the sign-in dialog, toasts, payment modal and coronation were in the first bundle | fixed, [#65](https://github.com/dxsarango/take-the-crown/pull/65) |
| P4 | Medium | Every public page ran its own database reads per request: the layout read the current season on every page, realm and legal pages read the season list twice (metadata and body), the home page and the legal pages read `app_config` | fixed, [#66](https://github.com/dxsarango/take-the-crown/pull/66) |
| P5 | Medium | Phones downloaded the 121 KB desktop throne scene as well as their own 70 KB one: CSS hides one of the two scenes but a hidden `img` still downloads | fixed, [#69](https://github.com/dxsarango/take-the-crown/pull/69) |
| P6 | Medium | `useServerNow` ticks every second in the top component of every page, so the whole page tree re-renders once a second (on the home page: the throne scene, every list, the footer), and it keeps ticking in a hidden tab. This is the INP risk the audit names | fixed, [#71](https://github.com/dxsarango/take-the-crown/pull/71) |
| P7 | Medium | No real-user measurement of Core Web Vitals | fixed in code, [#73](https://github.com/dxsarango/take-the-crown/pull/73); needs enabling in Vercel |
| P8–P13 | Low | See "Low findings" | listed |
| P14 | Medium | Profile, season and kingdom pages read the database on every request (only the season list was cached): about ten PostgREST calls per profile view, with the name lookup and ban check repeated by `generateMetadata`. Found by the load test | fixed, [#78](https://github.com/dxsarango/take-the-crown/pull/78): their reads go through the tagged data cache (10 s), dropped by every app write that changes them; rollover and live achievements (pg_cron) show within 10 s |

## Measure first

- **Lighthouse (mobile), local production build — verified.** Two runs each; "before" is `main`, "after" is [#65](https://github.com/dxsarango/take-the-crown/pull/65) (the other fixes change database load, not the page).

  | Page (`es`) | Score | FCP | LCP (simulated) | TBT | CLS | JS transferred |
  |---|---|---|---|---|---|---|
  | Home, before | 85–87 | 1.1 s | 4.0–4.3 s | 60–70 ms | 0 | 807 KiB |
  | Home, after | 81–82 | 1.1 s | 5.0–5.2 s | 60–80 ms | 0 | 811 KiB |
  | Rules, before | 90–94 | 0.9 s | 2.8–3.0 s | 90–280 ms | 0 | 491 KiB |
  | Rules, after | 94 | 0.9 s | 3.0 s | 30 ms | 0 | 333 KiB |
  | Hall of fame, before | 92 | 0.9–1.0 s | 3.4 s | 50–70 ms | 0 | 595 KiB |
  | Hall of fame, after | 89 | 0.9–1.0 s | 3.8 s | 60 ms | 0 | 526 KiB |

  Reading these honestly: TBT and CLS are good everywhere. Lighthouse's **simulated** LCP is above 2.5 s on the home page, but the LCP it **observed** in the trace is 200 ms (time to first byte 58 ms, render delay 120 ms, element: the phone throne image). The simulation inflates it by replaying the page's whole resource graph on a slow link, and it moved by ±1 s between builds that only changed lazy chunks and the other fixes, so I treat the simulated LCP as unreliable at this size. The 211 KB of throne images it replays is one cause, fixed by P5; it was measured before that fix. **Real numbers need PageSpeed Insights on a deployed preview** (owner checklist). Kingdom, profile and the season page were measured by bundle size only (below), not by Lighthouse; a full `en`/`es` matrix is in the owner checklist.
- **JavaScript per page (gzip), local build.** Before: home 423 KB, kingdom 406 KB, hall of fame 407 KB, season 407 KB. After #65: home 412 KB (keeps the realtime client, which it needs), kingdom 400 KB (reads history pages), hall of fame 338 KB, season 246 KB, rules 242 KB.
- **Real-user measurement — owner.** Only Vercel Web Analytics is installed (page views, no Web Vitals). Adding `@vercel/speed-insights` is cookieless but is a new provider, so the privacy policy must change first (the audit's own condition). It is a decision and a Vercel switch, not a code risk: P7.
- **WebPageTest / DevTools throttling — owner**, with the commands below.

## Rendering and JavaScript

- **Home renders per request, data cached 10 s — verified.** `cachedHomeData` is an `unstable_cache` of 10 s tagged `home`; with `pg_stat_statements`, 20 home views produced the home queries once. TTFB from the local server: 30–130 ms. TTFB from several regions needs a deployed URL (owner). Per-request render cost: the HTML is 75 KB (21 KB gzip), one inline SVG, no data fetching beyond the cache. Other public pages now also read through caches (P4): a warm legal page view went from 3 database statements to 0.
- **Bundle analysis — fixed (P3).** Largest chunks of the home page before: Supabase client 681 KB raw (realtime + auth), React DOM 234 KB, Next client 160 KB and 113 KB, next-intl 40 KB, Turnstile loader 60 KB. `next/dynamic` was not used anywhere. Now the sign-in dialog and unlock toasts load on demand, the payment modal and the coronation are fetched once the home page is idle, and pages without live data load no realtime code. Test: `e2e/performance.spec.ts`. Pixel art SVGs are plain `img` files, not bundled; animations are canvas code inside the coronation chunk. The admin screen is behind its own route.
- **INP — fixed (P6, [#71](https://github.com/dxsarango/take-the-crown/pull/71)).** The clock is now one shared store (`components/use-server-now.ts`): one timer, one request for the server offset, and `useSyncExternalStore` so a component re-renders only when the value it reads changes. The timer stops while the tab is hidden and ticks once on return. On the home page the per-second reading lives in `Hero` (clock, price, lock bar) and, while open, in the payment modal; the top bar, feed and footer read the clock by the minute, and the throne scene re-renders only when the lock flips. The legal and hall of fame pages read it by the minute. Kingdom, season, profile and edit-profile still tick each second at their top (they show second-level values in rows); they benefit from the pause but not from the isolation, which is a follow-up if their INP shows up in real-user data. Proof: `e2e/performance.spec.ts` hooks React commits and counts components that did work over 4.5 s: before, `HomeView` rendered 5 times and `Hero` 3 times in a hidden tab; after, only `Hero` renders (at least 3 times) and nothing renders while hidden.
- **Realtime — verified, one gap fixed.** One channel per page (`home`), plus one per signed-in viewer for their own unlocks and one while the share card of a fresh reign is shown; all are removed on unmount (`removeChannel` in each effect cleanup). No polling loops: the only interval besides the clock is the 1 s lock poll while a checkout is open (`/api/locks/[id]`, stops when the lock resolves or the modal closes). Gap: when the channel failed (plan limit), the page froze. [#67](https://github.com/dxsarango/take-the-crown/pull/67) refreshes every 30 s through the cached snapshot route while realtime is down and the tab is visible. Checked against the client library (`tests/unit/realtime-fallback.test.ts` drives the real supabase-js client with a fake socket): a refused socket reports `CHANNEL_ERROR`; a join answered with an error such as `ConnectionRateLimitReached` or the channel and join rate limits reports `CHANNEL_ERROR`; a server that never answers reports `TIMED_OUT`; a channel the server drops reports `CLOSED`. All three start the fallback (the first version missed `CLOSED`); `SUBSCRIBED` stops it, and the channel closing when the page is left does not restart it.
- **Third-party scripts — verified.** Turnstile loads only when the payment modal's human check mounts (`components/security/human-check.tsx` injects the script on demand); nothing else is third-party. The Vercel Analytics script loads only when `VERCEL_ENV=production`.

## Assets

- **Fonts — verified.** Manrope (400/500/700) and Pixelify Sans (500/700) through `next/font/google`: self-hosted at build time, Latin subset, `font-display: swap` by default, with an automatic size-adjusted fallback. Both are preloaded in the `Link` header (the 12 KB and 25 KB files), and both are used above the fold (body and brand). CLS measured 0.00006 on the home page.
- **Pixel art SVGs — finding (low).** `/art/**` is served with `public, max-age=31536000, immutable` but its URLs carry no version, so a changed asset would stay stale in browsers for a year (P8). Nothing is inlined in the HTML: the HTML holds a single inline `<svg>`; the throne, flags, seals and portraits are `img` files.
- **User images — verified.** Uploads are processed with sharp into a WebP and a pixel PNG and stored with `cache-control: 31536000`; avatars are generated SVGs with `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800`, keyed by season in the URL.
- **Sizes and CLS — verified.** Every `img` has `width` and `height` (or a sized box); the coronation canvas has explicit dimensions; Lighthouse CLS is 0 on all measured pages. The throne is a fixed-height box.

## Caching and edge

- **Static assets — verified.** `/_next/static/*` answers `public, max-age=31536000, immutable`. `/icons/*` answers `max-age=0` (P9).
- **Avatars and share cards — verified.** Avatars as above; share cards `s-maxage=604800` for finished reigns and `300` for live ones, keyed by reign id (a new reign is a new URL), asserted by `e2e/share.spec.ts`.
- **API — verified, one fix.** Dynamic routes answer `no-store`. Public read data now goes through cached server code: pages as in P4, and the live refresh through `/api/home?v=…` with `s-maxage=30` (P2), instead of every browser querying Supabase.

## Database

- **Foreign keys — fixed.** Nine foreign keys had no index; migration 0033 indexes the four that grow with the game (`payments.lock_id`, `events.season_id`, `price_locks.season_id`, `profile_achievements.season_id`). The other three (`crown_state`, `achievements`, `admin_actions`) hold a handful of rows; a test pins that rule. Migration 0032 had already indexed seven. The Supabase Performance Advisor itself reads the hosted project, so running it is in the owner checklist; the local equivalent (the foreign key query above) is clean.
- **Query plans — verified and fixed.** `profile_stats` and `season_leaderboard` aggregate all reigns, but every caller filters on the group key (`profile_id`, `season_id`), which Postgres pushes into the aggregation, so a profile read stays an index scan on `reigns_profile_idx`. The one caller that did not filter was the hall of fame (P1). With 50,000 players and reigns inserted into a local database (and rolled back), `hall_of_fame` returns its 35 rows in about 130 ms; the page reads it through a 30 s cache. The `season_leaderboard` and `country_leaderboard` views themselves are not materialised: with the filters above there is no read that needs it today. Revisit if `pg_stat_statements` on production shows them.
- **Connection pooling — verified (not needed).** The server never opens Postgres connections: it uses `supabase-js`, which calls PostgREST over HTTPS, and PostgREST holds its own pool. Supavisor matters only if a direct `pg` connection is added later (the tests use one; the app does not).

## Load test

The read-only plan is `scripts/load/read-only.k6.js` (owner checklist, step 6).

**Run on 2026-10-09 against production in prelaunch** (owner's machine, through Cloudflare; anonymous GETs only; 200 virtual users, 2 min ramp, 5 min hold, 1 min down). **Passed.**

| Route | p50 | p95 | p99 | Vercel p75 duration |
|---|---|---|---|---|
| All | 242 ms | 464 ms | 635 ms | |
| `/en` | 245 ms | 390 ms | 584 ms | 71 ms |
| `/api/home?v=` | 129 ms | 227 ms | 315 ms | 143 ms |
| `/en/kingdom` | 279 ms | 433 ms | 639 ms | 126 ms |
| `/en/u/<name>` | 406 ms | 607 ms | 780 ms | 247 ms |
| `/en/seasons/genesis` | 336 ms | 508 ms | 710 ms | 174 ms |

- 17,261 requests (35/s), 0 errors, 0 failed checks. One home request took 5.06 s, consistent with the 0.4% cold starts.
- Vercel: 0% errors and timeouts, cold starts 0.4%, memory 256 MB of 2 GB, CPU throttle 5.5% (p75). `/api/home` ran 245 functions for about 5,750 requests: the CDN answered about 96% of them (P2 holds).
- Supabase (Free plan): CPU 4%, memory 62%, peak connections 24 of 60, 0.02% errors. The API gateway count rose to about 75,000 requests in 24 hours, nearly all of them during the run: profile, season and kingdom pages read the database on every request (P14, since fixed).
- Client latency includes the round trip from the owner's machine to `iad1`; the Vercel column is the server's share.

- **Realtime limits for the plan** (Supabase documentation, Realtime limits): Free 200 concurrent connections and 100 messages/s; Pro 500 and 500; Pro without spend cap and Team 10,000 and 2,500; each project can be raised on request. One open home page is one connection. **Decide before launch**: a post that brings more than 500 simultaneous viewers saturates Pro with the spend cap on. What happens then is now graceful (30 s refresh through the CDN-cached route) rather than a frozen page, and the database cost of the refresh no longer scales with viewers (P2); but the live feel is lost, so the decision is the owner's: lift the cap on launch day, or accept the fallback.
- **Database message throughput.** Realtime `postgres_changes` is delivered by one process per database and is the slowest delivery mode; the page listens to two tables (`crown_state` updates, `events` inserts) with no filter, so every event reaches every viewer. Achievement and rank events are inserted per player; at launch this is the volume to watch (message count in the Realtime dashboard).

## Low findings

| # | Finding | Suggestion |
|---|---|---|
| P8 | `/art/**` is `immutable` for a year at unversioned URLs | Add `?v=<build id>` to the art URLs, or lower the cache to a week with `stale-while-revalidate` until art changes are frozen |
| P9 | `/icons/*` answers `max-age=0` | `public, max-age=86400` in `next.config.ts` headers |
| P10 | Each page view makes three function calls on load: `/api/time`, `/api/geo` and `/api/me` (all `no-store`). `geo` is only needed when the payment modal opens | Fetch `geo` on the first "Take the crown" click; the other two are cheap but are 3 invocations per view during a spike |
| P11 | `/api/home?v=` accepts any well-formed `v`, so a client can bypass the edge cache | Same exposure as before (the old path queried Supabase directly with the public key); add a rate limit rule in the Vercel firewall for `/api/home` if abused |
| P12 | Home still ships about 412 KB gzip of JavaScript, of which the Supabase client is about 160 KB | The realtime client could be loaded after first paint on the home page too (a dynamic import inside `useLiveHome`); I left it because the page then renders from server data with no live feel for a moment, a product call |
| P13 | `season_leaderboard`, `country_leaderboard` and `profile_stats` are views over all reigns | Materialise or cache only if production statements show them (see Database) |

## Pull requests

Merged to `main`, in this order: [#65](https://github.com/dxsarango/take-the-crown/pull/65), [#66](https://github.com/dxsarango/take-the-crown/pull/66), [#69](https://github.com/dxsarango/take-the-crown/pull/69), [#67](https://github.com/dxsarango/take-the-crown/pull/67), [#68](https://github.com/dxsarango/take-the-crown/pull/68) (migration 0033, pushed to production first), [#70](https://github.com/dxsarango/take-the-crown/pull/70) (the first version of this report).

Open: [#71](https://github.com/dxsarango/take-the-crown/pull/71) (INP, with this update of the report).

## Owner checklist

1. After [#73](https://github.com/dxsarango/take-the-crown/pull/73) merges: enable **Speed Insights** in the Vercel project (Speed Insights tab → Enable) and redeploy. The code, the scrubbing and the privacy policy update (both languages) are in that PR; until it is enabled there are no real-user Web Vitals.
2. Run **PageSpeed Insights** (mobile) on a Vercel preview or the production URL for `/en`, `/es`, a profile, `/en/kingdom`, `/en/hall-of-fame` and a season page. Record score, LCP, INP, CLS, TTFB. Compare with the lab table above.
3. Run the **Supabase Performance Advisor** on the hosted project (Dashboard → Advisors → Performance). Expected: no unindexed foreign keys beyond `crown_state`, `achievements` and `admin_actions`; "unused index" notes are expected before traffic.
4. **TTFB by region**: WebPageTest (Moto G, 4G) for `https://takethecrown.app/en` from three or more regions.
5. **Decide the Realtime plan** (limits above) before launch day, and check **Settings → Realtime** on the project for the concurrent connection and messages-per-second ceilings.
6. **Load test**, against production in prelaunch, from your machine, off-peak, with the Supabase and Vercel dashboards open: `k6 run -e PROFILE=<player name> scripts/load/read-only.k6.js`. Anonymous GETs only (home, `/api/home`, kingdom, a profile, a season), ramp to 200 virtual users in 2 minutes, hold 5, ramp down in 1; it fails above 1% errors or a p95 of 800 ms and aborts above 10% errors. The Cloudflare rate-limit rule only counts non-GET writes, so it does not match this traffic.

   Record error rate, p95 latency, Supabase CPU and connections, and Vercel function concurrency and duration. The page-view path should keep the database near idle (cached reads); if Supabase CPU moves, look at `pg_stat_statements` for which statement. A takeover under contention is the lock test in `tests/db/concurrency.test.ts`; a production run of it needs the test payment provider and is not recommended.
7. **Realtime connections near the plan limit**: k6 has no Realtime support; use the Supabase Realtime inspector or a small script with `@supabase/supabase-js` opening N channels from your machine, and watch the Realtime dashboard.
8. After merging [#68](https://github.com/dxsarango/take-the-crown/pull/68): `supabase db push` to production, confirm, then merge. After merging [#63](https://github.com/dxsarango/take-the-crown/pull/63)'s analytics, remember Vercel Analytics must be enabled in the project.
