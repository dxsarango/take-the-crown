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

## Pre-production

- [ ] Replace the social logos in `design/assets/icons/social/` (drawn from memory) and the new TikTok, website, GitHub and LinkedIn icons with marks checked against the official brand kits
- [ ] Set the real T0 launch date in `seasons`

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

- [ ] Fix `generate_username()` / `gen_random_bytes` in a new migration (bug found in M1: on Supabase `pgcrypto` lives in schema `extensions`, and functions pinned to `search_path = public` cannot find it, so every guest purchase and first sign-in fails). Audit every function that uses pgcrypto or relies on `search_path` for the same problem; cover with tests
- [ ] Migration: public name replaces `username` + `display_name` (unique case-insensitive, 3–24, `[A-Za-z0-9._-]`), `name_changed_at` with 30-day limit, `profile_name_history` for redirects; lock and reign keep a name snapshot; availability check function
- [ ] Migration: `avatar_seed` (random, set at creation; guests pass it through the lock) and `avatar_traits` jsonb validated against avatar-lib layers
- [ ] Migration: social links website, X, YouTube, TikTok, Instagram, GitHub, LinkedIn stored as normalized URLs with per-platform domain checks
- [ ] Migration: privacy toggles (main rival, chronicle), "no country" allowed; price-drop alert threshold (USD cents), season-start alert / "Remind me" subscriptions, outbox jobs for both
- [ ] Update `docs/SPEC.md` to match the decisions and new migrations
- [ ] Test harness against local Supabase (service role client or direct `pg`), reset between tests
- [ ] Price: `price_at` decay, floor, ceil rounding; TS client formula matches `price_at` for sampled inputs
- [ ] Rank thresholds (`rank_for_seconds`) and TS mirror for display only
- [ ] Lock contention: second lock raises `crown_locked`; expired lock can be replaced
- [ ] Lock errors: `rate_limited`, `already_king`, `banned`, `season_closed`, `message_too_long`
- [ ] Duplicate webhooks: same event id and same provider payment id return `duplicate`
- [ ] Late payments inside and outside grace; wrong currency; underpayment → `refund_pending`
- [ ] Payment for a stale expected reign → `refund_pending`
- [ ] Self-takeover blocked at lock and at apply
- [ ] Concurrency: two parallel `record_paid_payment` for different locks → exactly one reign
- [ ] Season rollover: closes reign with `season_end`, stores season king, resets to floor, events; `no_next_season_configured`
- [ ] Every achievement rule (first_blood, regicide, one_minute_king, night_owl, revenge, guardian 1/2/3 on takeover and live, bargain_hunter, collector, rivalry, patriot, founder, remembered)
- [ ] Guest claim: `resolve_buyer_profile` by email, `ensure_profile_for_user` claims or creates
- [ ] RLS: anon cannot write any table, cannot read `profile_private`, `payments`, `price_locks`; can read public views
- [ ] Dethroned notification only when alerts enabled
- [ ] CI-ready script (`pnpm test:db`) documented

## Milestone 3 — Read-only home

- [ ] Supabase clients: server (service role, server-only) and browser (anon)
- [ ] Generated database types
- [ ] Season resolution server-side; `data-season` on `<html>`; season asset lookup with T0 fallback
- [ ] Top bar: brand, season pill with days left, EN/ES segmented switch, Sign in
- [ ] Hero scene (98×72 ×4 mobile, 240×84 ×6 desktop) with throne, rank frame, avatar, crown
- [ ] Avatar route `GET /avatar/[name].svg?season=&crown=`, seeded by `avatar_seed` + `avatar_traits`, using `design/lib/avatar-lib.js`, long cache per season; regression test against `assets/avatar/samples`
- [ ] King block: name, flag / country pill, rank tag, message, link (`rel="sponsored ugc noopener"`), Report button (disabled until M7)
- [ ] Reign clock (server timestamps, clock offset from `Date` header)
- [ ] Live price from `public_crown_state` with shared price formula; dropping arrow animation; floor state
- [ ] Home states: locked by someone else (countdown, 20-segment bar, crown shake), empty throne, floor price
- [ ] Line of succession, hall of fame preview, "Proclamations" feed (last 24 h)
- [ ] Footer: stone band + seal, legal links
- [ ] Realtime: `crown_state` updates and `events` inserts → refetch
- [ ] ISR with short revalidate
- [ ] Parameterize copy that hardcodes config values and sample data (decision 8); brand name via a single config constant (decision 10); season dates from `seasons` (decision 1); neutral `share.chaLabel` (decision 11)
- [ ] Reduced-motion variants
- [ ] Unit tests (price formula, clock offset, formatting) + e2e smoke; screenshots at 390 / 1440 compared with `Portada*.dc.html`

## Milestone 4 — Lock, test payment provider, webhook, coronation

- [ ] Payment provider interface + `test` provider (simulated checkout page and signed webhook)
- [ ] `POST /api/locks`: zod validation, IP hash, map DB errors to UI states, `set_lock_checkout`
- [ ] `POST /api/locks/[id]/release`
- [ ] `POST /api/webhooks/[provider]`: signature verification, normalize, `record_paid_payment`, refund on `refund_pending`, `mark_payment_refunded`
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
- [ ] Achievement unlocked toast (queue, pause on hover/focus, `aria-live`), per-user realtime event
- [ ] `/kingdom`: history timeline by day, size by duration, season filter
- [ ] `/hall-of-fame`: 4 tabs, season / all-time scope, pixel podium
- [ ] `/seasons/[slug]`: King of the Season banner portrait, podium, stats, next season announcement with "Remind me"
- [ ] Tests + screenshots vs `Reino.dc.html`, `Logro Desbloqueado.dc.html`

## Milestone 7 — Moderation, reports, admin

- [ ] Link rules: https only, shortener / chat-invite / blocklist domains, social domain allowlists
- [ ] Moderation with `claude-haiku-4-5`, strict JSON verdict parsed with zod; rejection reasons mapped to modal copy
- [ ] `POST /api/reports` (one per IP per reign)
- [ ] `/admin`: crown + lock, payments with manual refund, reports queue (hide message, ban), seasons, `app_config` editor
- [ ] Tests: link validation, moderation parsing, report dedupe, admin guard

## Milestone 8 — Share cards, email outbox, dethroned alert

- [ ] `GET /og/[template]/[id]` for victory, challenge, achievement, dethroned at 1200×630 and 1080×1920 (fonts embedded, pixel art as PNG at integer scale)
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
- [ ] Supabase project: migrations, pg_cron, realtime, Storage bucket, Auth providers
- [ ] End-to-end run with small real payments, including a refund
- [ ] Tag `v0.1.0` at launch
