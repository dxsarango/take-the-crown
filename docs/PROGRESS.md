# Progress

Checklist for the build order in `docs/SPEC.md` §17. A milestone is done when its tasks are checked, tests pass, and lint and typecheck are clean.

## Decisions

Conflicts between the design handoff (`/design`), the spec and the migrations, as resolved by the product owner. Schema changes go in new M2 migrations and `docs/SPEC.md` is updated to match.

1. **Season calendar.** Season dates always come from the `seasons` table, never from i18n copy. The T0 start in the seed stays a placeholder until the real launch date is set.
2. **Season identifiers.** The DB slug is canonical for routes (`/seasons/[slug]`); the UI maps `seasons.id` to design assets (`t0`, `t1`, `t2`).
3. **Social links.** Seven optional links: website, X, YouTube, TikTok, Instagram, GitHub, LinkedIn. The form accepts a handle or a URL; the normalized URL is stored and validated against each platform's domains. The design needs TikTok, website, GitHub and LinkedIn icons consistent with the others.
4. **Price lock.** The spec wins: the lock is created on submit, after validation, Turnstile and moderation. The modal countdown starts after submit, and a moderation rejection happens before any lock exists.
5. **Avatar.** Each profile gets a random `avatar_seed` and an optional `avatar_traits` jsonb of per-layer overrides, validated against the layers in `avatar-lib.js`. For guests, the modal generates the seed when it opens, uses it for the preview and sends it with the lock so the resulting profile gets it. The per-layer editor ships in edit profile.
6. **Identity.** Username and display name merge into one public name: unique case-insensitive, 3–24 chars, letters, numbers, `.`, `_`, `-`. It is the profile URL (`/u/[name]`, lowercased). Guests choose it in the payment modal with a live availability check. Editable once every 30 days; old names are kept in a history table and redirect to the current profile. Reigns keep the name snapshot they were won with.
7. **Features.** Ship the price-drop alert with a USD threshold, the season-start alert and the "Remind me" button (same mechanism), and privacy toggles for main rival and chronicle. Instead of a country toggle, allow "no country". The weekly digest is removed from the UI for now.
8. **Hardcoded values in copy.** Approved: parameterize rule values and sample data with ICU placeholders in both locales as each screen is built.
9. **Avatar route.** Approved: `GET /avatar/[name].svg?season=&crown=`.
10. **Brand name.** "Take the Crown", held in a single config constant and inserted into copy via placeholders.
11. **Neutral copy.** `share.chaLabel`: "Dethrone them for" / "Quítale la corona por".
12. **Name in URLs.** Resolved by 6.
13. **Breakpoint.** Approved: `lg` (1024 px).
14. **Price step.** Approved: +20% per the spec; the prototype's $34 → $38 is not a rule.
15. **Upload limits.** Approved: 5 MB input (PNG/JPG/WebP), stored original max 512 px plus a 32×32 pixelated version.
16. **Social logos.** Pre-production task (see below).
17. **Segmented switch relief.** Approved: follow the prototype (2 px insets).
18. **Payment modal avatar upload.** Approved: upload only in edit profile.
19. **Rank-up events.** A `rank_up` event, emitted once per profile per rank (unique in the database, since the live check runs every minute). Shown in the feed, as a toast like an achievement unlock, and as a share card. Built in M6; the card in M8.
20. **Mobile top bar.** The brand keeps the design's 20 px on mobile; "Sign in" becomes an icon button there (accessible label, 44 px touch area). The design has no user icon, so an 8×8 pixel bust in the style of its 8×8 icons is used. If a longer brand stops fitting, ask the design for a compact mobile lockup.
21. **Avatar route.** `GET /avatar/[name].svg` moves to M8 with share cards and email; pages render portraits inline.

## Deployment checklist

Steps for every hosted environment (staging and production).

- [ ] Set the real season dates in `seasons` (T0 launch date first) with a migration or the admin seasons list; the seed dates in `0001_init.sql` are placeholders
- [ ] Push migrations with `supabase db push` and never `--include-seed`: `supabase/seed.sql` is local-only
- [ ] Confirm pg_cron jobs (`rollover-season`, `live-achievements`, `price-alerts`) are scheduled and active

## Pre-production

- [ ] Replace the social logos in `design/assets/icons/social/` (drawn from memory) and the new TikTok, website, GitHub and LinkedIn icons with marks checked against the official brand kits

## Milestone 1 — Scaffold, tokens, i18n, local Supabase

- [x] Check local toolchain (Node, pnpm, Docker, Supabase CLI)
- [x] Next.js App Router, TypeScript strict, pnpm
- [x] Tailwind v4 wired to `design/tokens/tokens.css` + `tailwind-v4.css`
- [x] Fonts: Manrope (400/500/700) and Pixelify Sans (500/700) via `next/font/google`
- [x] next-intl with `en` (default) and `es`, locale from path → cookie → `Accept-Language`
- [x] `messages/en.json` and `messages/es.json` from `design/i18n` (+ app metadata keys)
- [x] Placeholder home under `/[locale]` with the design top bar (brand + EN/ES switch), tokens and messages
- [x] Supabase CLI project (`supabase/config.toml`), both migrations applied by `supabase db reset`
- [x] Vitest configured with an initial test (message key parity + design coverage)
- [x] Playwright configured with an initial smoke test on 390 px and 1440 px
- [x] ESLint and `typecheck` script
- [x] `.env.example` with every variable from SPEC §16

## Milestone 2 — Database test suite

- [x] Fix `generate_username()` / `gen_random_bytes` in a new migration (bug found in M1: on Supabase `pgcrypto` lives in schema `extensions`, and functions pinned to `search_path = public` cannot find it, so every guest purchase and first sign-in fails). Audit every function that uses pgcrypto or relies on `search_path` for the same problem; cover with tests
- [x] Migration: public name replaces `username` + `display_name` (unique case-insensitive, 3–24, `[A-Za-z0-9._-]`), `name_changed_at` with 30-day limit, `profile_name_history` for redirects; lock and reign keep a name snapshot; availability check function
- [x] Migration: `avatar_seed` (random, set at creation; guests pass it through the lock) and `avatar_traits` jsonb validated against avatar-lib layers
- [x] Migration: social links website, X, YouTube, TikTok, Instagram, GitHub, LinkedIn stored as normalized URLs with per-platform domain checks
- [x] Migration: privacy toggles (main rival, chronicle), "no country" allowed; price-drop alert threshold (USD cents), season-start alert / "Remind me" subscriptions, outbox jobs for both
- [x] Update `docs/SPEC.md` to match the decisions and new migrations
- [x] Test harness against local Supabase (service role client or direct `pg`), reset between tests
- [x] Price: `price_at` decay, floor, ceil rounding; TS client formula matches `price_at` for sampled inputs
- [x] Rank thresholds (`rank_for_seconds`) and TS mirror for display only
- [x] Lock contention: second lock raises `crown_locked`; expired lock can be replaced
- [x] Lock errors: `rate_limited`, `already_king`, `banned`, `season_closed`, `message_too_long`
- [x] Duplicate webhooks: same event id and same provider payment id return `duplicate`
- [x] Late payments inside and outside grace; wrong currency; underpayment → `refund_pending`
- [x] Payment for a stale expected reign → `refund_pending`
- [x] Self-takeover blocked at lock and at apply
- [x] Concurrency: parallel `record_paid_payment` for different locks → exactly one reign
- [x] Season rollover: closes reign with `season_end`, stores season king, resets to floor, events; `no_next_season_configured`
- [x] Every achievement rule (first_blood, regicide, one_minute_king, night_owl, revenge, guardian 1/2/3 on takeover and live, bargain_hunter, collector, rivalry, patriot, founder, remembered)
- [x] Guest claim: `resolve_buyer_profile` by email, `ensure_profile_for_user` claims or creates
- [x] RLS and privileges: anon and authenticated cannot write any table or view, cannot execute any `security definer` function, read only public data (+ own `profile_private`)
- [x] Dethroned notification only when alerts enabled
- [x] `pnpm test:db` (and `pnpm test` for unit + db) documented in SPEC §15
- [x] Fix migrations for bugs the suite found:
  - `0003`: `generate_username()` used pgcrypto from the wrong schema; pin `search_path` on every function
  - `0004`: clients could `TRUNCATE` tables and rewrite reigns through the updatable `public_reigns` view; revoke everything but `SELECT` on public data
  - `0005`: locks and payments were accepted before `seasons.starts_at`; the reign closed by a season rollover lost Guardian tiers reached in its last minute
- [x] Decision migrations: `0006` social links, `0007` privacy and alerts, `0008` public name and avatar, `0009` admin release of a reserved name
- [x] Local-only `supabase/seed.sql` opens the current season; test teardown re-applies it
- [x] Re-checked the local backend crash (function permission error after switching roles from a `postgres` session): gone with Supabase CLI 2.118 / Postgres 17.6.1.171. Role tests still log in as `authenticator`, like PostgREST

## Milestone 3 — Read-only home

- [x] Supabase anon client for public reads (server and browser); service-role client moves to M4, where the first write happens
- [x] Generated database types (`pnpm db:types`)
- [x] Season from `crown_state`; `data-season` on `<html>` (kept in step on live rollover); T2 art falls back to T0
- [x] Top bar: brand constant, season pill with days left (dates from `seasons`), EN/ES switch, Sign in (wired in M5)
- [x] Throne scene: ported `sceneT0`/`scene1` generators, one static SVG per season/size (`/art/throne/…`), wider than any screen and centered so it grows sideways; portrait (rank frame + avatar + season crown) laid over the seat at the same integer scale (×4 mobile, ×6 desktop)
- [x] Pixel regression tests: scenes, rank frames and avatar samples match the design exports pixel for pixel
- [x] King block: name, flag or country pill, rank tag, message, link (`rel="sponsored ugc noopener"`, `target="_blank"`), Report button (wired in M7)
- [x] Reign clock from server timestamps with a clock offset from `/api/time`
- [x] Live price with the shared formula (parity test: 400 random samples + ~58,000 timestamps every 37 s against `price_at`); dropping arrow animation; floor state
- [x] Home states: someone else's lock (frozen price, countdown, 20-segment bar, crown shake), empty throne (spotlight scene), floor price
- [x] Line of succession, hall of fame preview (this season), Proclamations feed (last 24 h)
- [x] Footer: season stone band + seal, legal links (pages in M9)
- [x] Realtime: `crown_state` updates and `events` inserts → refetch; lock expiry handled client-side
- [x] ISR (`revalidate = 10`)
- [x] Parameterized copy: config values (`{percent}`, `{price}`), `{brand}`, season number; neutral `share.chaLabel`; season names and dates from `seasons`
- [x] Reduced motion: no arrow step animation, no crown shake
- [x] Unit tests (price, hero state, clock offset, formatting, messages, art) and e2e (content, states, locale switch, live update); screenshots at 390/1440 in T0 and T1, en and es, compared with `Portada.dc.html` and `Portada Estados.dc.html`
- [x] Mobile top bar: brand at the design's 20 px, "Sign in" as an icon button (decision 20); e2e checks the fit in en and es
- [x] Avatar route moved to M8 (decision 21)

## Milestone 4 — Lock, test payment provider, webhook, coronation

- [ ] Payment provider interface + `test` provider (simulated checkout page and signed webhook)
- [ ] `POST /api/locks`: zod validation, IP hash, map DB errors to UI states, `set_lock_checkout`
- [ ] `POST /api/locks/[id]/release`
- [ ] `POST /api/webhooks/[provider]`: signature verification, normalize, `record_paid_payment`, refund on `refund_pending`, `mark_payment_refunded`
- [ ] Known emails: a signed-out buyer whose email already has a profile (claimed or not) gets a magic link instead of a lock, with one neutral message that never reveals the profile's name or whether the typed name differs; only emails without a profile buy as guests. Enforce it in a migration (`create_price_lock` rejects guest locks for known emails; `apply_payment` refunds a guest payment whose email gained a profile after the lock) and in `POST /api/locks`
- [ ] Impersonation tests (db + API + e2e): paying with someone else's email never creates a reign under their profile, and responses for claimed, unclaimed and unknown emails don't reveal which is which
- [ ] Payment modal (bottom sheet mobile / modal desktop): form with public name + live availability check, country detection (`cf-ipcountry`) or no country, avatar seed generated on open for the live preview, countdown only after the lock is created on submit, moderation rejection before any lock, processing, completed, errors
- [ ] Home states: payment error, lock expired
- [ ] Coronation animation (canvas, 1.8 s, reduced 400 ms fade) triggered by realtime
- [ ] Revalidate home/profile after `applied`
- [ ] Tests: API route unit tests, e2e take the crown as guest, locked state

## Milestone 5 — Auth and profiles

- [ ] Supabase Auth: Google, X, magic link (15 min); auth callback calls `ensure_profile_for_user`
- [ ] Login sheet/modal: interactive, after-payment, link sent (resend after 30 s)
- [ ] Public profile `/u/[name]` (old names redirect): veteran and new-player variants, stats, chronicle, rival, showcase, collection, socials
- [ ] Edit profile `/settings/profile`: sections, save bar states, validation
- [ ] `PATCH /api/profile` with zod; social validation
- [ ] `POST /api/profile/avatar`: type/size check, original max 512 px + 32×32 nearest-neighbor quantized to core palette (sharp), Storage bucket `avatars`
- [ ] Per-layer avatar editor, name change with 30-day limit and old-name redirects, seven social links, privacy toggles, alerts (dethroned, price drop, season start); no weekly digest
- [ ] Tests: e2e sign in and claim, profile edit; unit tests for validation and image processing

## Milestone 6 — Achievements UI, kingdom, hall of fame, season end

- [ ] Medal component (on/off, rarity ring, seasonal ring by origin season)
- [ ] Migration: `rank_up` event kind, emitted once per profile per rank (unique constraint) by `apply_payment` and the per-minute live check; db tests including repeated checks
- [ ] Rank-up in the Proclamations feed ("rose to Duke")
- [ ] Achievement unlocked toast (queue, pause on hover/focus, `aria-live`), per-user realtime event; the same toast for rank-ups
- [ ] `/kingdom`: history timeline by day, size by duration, season filter
- [ ] `/hall-of-fame`: 4 tabs, season / all-time scope, pixel podium
- [ ] `/seasons/[slug]`: King of the Season banner portrait, podium, stats, next season announcement with "Remind me"
- [ ] Tests + screenshots vs `Reino.dc.html`, `Logro Desbloqueado.dc.html`

## Milestone 7 — Moderation, reports, admin

- [ ] Link rules: https only, shortener / chat-invite / blocklist domains, social domain allowlists
- [ ] Moderation with `claude-haiku-4-5`, strict JSON verdict parsed with zod; rejection reasons mapped to modal copy
- [ ] `POST /api/reports` (one per IP per reign)
- [ ] `/admin`: crown + lock, payments with manual refund, reports queue (hide message, ban), release a reserved former name (`release_profile_name`), seasons, `app_config` editor
- [ ] Tests: link validation, moderation parsing, report dedupe, admin guard

## Milestone 8 — Share cards, email outbox, dethroned alert

- [ ] `GET /og/[template]/[id]` for victory, challenge, achievement, rank-up, dethroned at 1200×630 and 1080×1920 (fonts embedded, pixel art as PNG at integer scale); rank-up card needs a design
- [ ] Avatar route `GET /avatar/[name].svg?season=&crown=`, seeded by `avatar_seed` + `avatar_traits`, long cache per season (used by share cards and email)
- [ ] OG/Twitter metadata on home, profile, season pages
- [ ] Resend setup; Supabase Auth SMTP through Resend
- [ ] react-email dethroned template (en/es) from the design
- [ ] Price-drop and season-start alert emails (en/es)
- [ ] Outbox sender after webhook + `GET /api/cron/notifications` (secret, max 5 attempts)
- [ ] Tests: outbox retries, template rendering, e2e dethroned flow

## Milestone 9 — Security hardening and legal

- [ ] Turnstile on lock creation
- [ ] Rate limits on `/api/*` (app level) and Cloudflare rules documented
- [ ] Strict CSP (payment provider + Turnstile only), security headers
- [ ] Audit: service role only server-side, no secrets in client bundles
- [ ] `/rules`, `/faq`, `/terms`, `/privacy` (drafts provided separately)
- [ ] Tests: CSP headers, rate-limit behaviour, locale switch e2e

## Milestone 10 — Real payment provider and staging

- [ ] Implement the approved provider (Paddle, Lemon Squeezy or Dodo) behind the interface
- [ ] Staging deploy on Vercel behind Cloudflare, spend limits, Vercel cron
- [ ] Supabase project: migrations, pg_cron, realtime, Storage bucket, Auth providers (follow the deployment checklist above)
- [ ] End-to-end run with small real payments, including a refund
- [ ] Tag `v0.1.0` at launch
