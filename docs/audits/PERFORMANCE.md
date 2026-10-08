# Performance audit

Goal: the site stays fast on a mid-range phone on a mobile network and survives a viral spike. Core Web Vitals targets at the 75th percentile: LCP under 2.5 s, INP under 200 ms, CLS under 0.1. INP is the metric most sites fail.

Output: `docs/audits/PERFORMANCE-REPORT.md` with measurements before and after.

## Measure first

- Lighthouse and PageSpeed Insights (mobile) for home, a profile, kingdom, hall of fame and a season page, in `en` and `es`. Record scores and the three metrics.
- Enable real-user measurement: Vercel Speed Insights (cookieless) or the `web-vitals` library reporting to the server. If a new provider is added, update the privacy policy.
- WebPageTest or Chrome DevTools with CPU 4x slowdown and "Fast 4G" for the home.

## Rendering and JavaScript

- The home renders per request because of the CSP nonce, with data cached 10 s. Confirm TTFB from several regions and that the per-request render stays cheap under load.
- Bundle analysis: list the largest client chunks; keep pixel art, animations and realtime client code out of pages that do not need them; dynamic import for the payment modal, coronation animation and admin.
- INP: the live clock and price update every second; make sure they update only their own text nodes, never re-render the whole page, and pause when the tab is hidden.
- Realtime: one subscription per page, cleaned up on navigation; no polling loops.
- Third-party scripts: only Turnstile, loaded where needed, not on every page.

## Assets

- Fonts: self-hosted, subset, `font-display: swap`, preload only the font used above the fold; no layout shift when they load.
- Pixel art SVGs: cached long term with versioned URLs; avoid inlining large SVG scenes in HTML if it bloats every response, or inline once and reuse.
- Images uploaded by users: served in modern formats at the displayed size, long cache.
- Explicit sizes on every image and canvas to avoid CLS; reserve space for the throne, toasts and banners.

## Caching and edge

- Static assets: `Cache-Control: public, max-age=31536000, immutable`.
- Avatars and share cards: cached at the edge with season-aware keys.
- API: `no-store` stays for dynamic routes; public read data served through cached server code, not client calls to Supabase on every view.

## Database

- Supabase Performance Advisor: zero unindexed foreign keys and no slow queries for the home, profiles and leaderboards.
- Check query plans for leaderboards and profile stats views; materialize or cache them if they grow (they aggregate all reigns).
- Connection pooling for serverless (Supavisor transaction mode) for server queries.

## Load test

- Run the k6 plan (in progress) against production in prelaunch: home spike, realtime connections near the plan limit, lock creation under contention. Record errors, p95 latency, Supabase CPU and connections, and Vercel function concurrency.
- Check Supabase Realtime limits for the plan against an expected launch peak and decide whether to upgrade or degrade gracefully (fall back to periodic refresh when realtime is saturated).

## References

- Core Web Vitals: https://web.dev/articles/vitals
- Optimize INP: https://web.dev/articles/optimize-inp
