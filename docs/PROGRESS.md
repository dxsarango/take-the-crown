# Progress

Checklist for the build order in `docs/SPEC.md` §17. A milestone is done when its tasks are checked, tests pass, and lint and typecheck are clean.

## Open questions

Conflicts between the design handoff (`/design`), the spec and the migrations. Nothing below has been decided silently; where work must continue, the interim choice is stated.

1. **Season calendar.** Design: T0 Genesis runs Sep 15 – Oct 31, 2026 (`seasons/t0-genesis.json`, `season.dates.0`, `realm.began`). Migration seed: T0 starts 2026-10-01 (spec §18 says set it to the real launch date). T1/T2 agree (Nov 1 → Dec 1, Dec 1 →). Needs the real launch date; season dates in UI copy should then come from `seasons.starts_at/ends_at`, not i18n.
2. **Season identifiers.** Design keys `genesis`, `muertos`, `escarcha`; DB slugs `genesis`, `day-of-the-dead`, `frost`. Interim: DB slug is canonical for routes (`/seasons/[slug]`); the UI maps `seasons.id` to design assets (`t0`, `t1`, `t2`).
3. **Social networks.** Design (edit profile, `social-lib.js`, `social` messages, logos): X, Instagram, GitHub, LinkedIn, YouTube. Spec §7 and `profiles`: website, X, YouTube, TikTok, Instagram. Design also stores handles, the DB stores links. Needs a decision; either way a new migration is required (GitHub/LinkedIn columns, or TikTok logo + copy in the design).
4. **When the price lock starts.** Design: the 5:00 lock starts when the payment modal opens, and a moderation rejection keeps the lock. Spec §4: the lock is created by `POST /api/locks` after validation, Turnstile and moderation, so the form is filled before the lock exists. Interim: follow the spec (lock on submit); the modal's countdown then starts after submit.
5. **Avatar seed and customization.** Design: the generated avatar comes from the display name typed in the payment modal ("Your king is generated from this name") and edit profile has a per-layer avatar editor (skin, hair, cape, crown…). Spec §8: deterministic from `username`, and there is no column for layer choices. Guest usernames are random (`king_xxxxxxxx`), so a username seed would not match the modal preview. Needs a decision plus a migration for stored traits if the editor ships.
6. **Display name rules.** Design: 3–24 chars, letters/numbers/`. _ -`, unique ("{name} is taken"). DB: `display_name` 1–32 any chars, not unique; `username` is `^[a-z0-9_]{3,24}$` and unique. Needs a decision on what the edit-profile "Name" field edits (display name vs username) and on the limits.
7. **Features in the design with no data model.** Edit profile: "The price drops" alert with a USD threshold, season-start alert, weekly digest, privacy toggles for country / main rival / chronicle (DB has only `show_total_spent`). Season end: "Remind me when it starts". Decide which ship in v1; each needs a migration and outbox work.
8. **Hardcoded rule values in copy.** `common.dropping` ("2% every hour"), `common.floor` ("$5"), `homeStates.takeFirst`, `share.mNote`, `season.nextDesc` and others bake in values that must come from `app_config`. Also sample data in copy (`homeStates.exp2` "$38", `realm.today` "Sep 27", `realm.keep` "214 kings", `profile.allReigns` "12 reigns", `share.pct`, `editProfile.alHelp` masked email). Interim: messages copied as-is in M1; parameterize them (ICU placeholders in both locales) when each screen is built.
9. **Avatar route.** Design suggests `/api/avatar/[username]?season=&crown=`; spec §5 has `GET /avatar/[username].svg?season=`. Interim: spec route, adding a `crown` query param because past kings render without a crown.
10. **Brand name.** Design and copy use "Crown" (e.g. "isn't allowed on Crown", "you reigned on Crown"); the spec uses the working name "Take the Crown". Final name is an open item in spec §18.
11. **Gendered copy.** `share.chaLabel` "Dethrone her for" / Spanish equivalent; the design notes a neutral form is pending. Proposal: "Dethrone them for" / "Destrónalo por…" rewritten neutrally.
12. **Username vs display name in URLs and edits.** Guest profiles get random usernames and there is no UI in the design to change the username, but `/u/[username]` is the public profile URL. Related to 6.
13. **Mobile/desktop breakpoint.** Not fixed by the design (drawn at 390 and 1440); the design proposes `lg` (1024 px). Interim: `lg`.
14. **Price step in prototype.** Prototype shows $34 → $38 after a coronation; the rule is +20% (spec and `apply_payment`). Spec wins; no decision needed unless the step should change.
15. **Upload limits.** Design: PNG/JPG/WebP up to 5 MB. Spec §8: keep the original resized to max 512 px plus a 32×32 pixelated version. Not contradictory: interim is 5 MB input limit, stored original max 512 px.
16. **Social logos** in `design/assets/icons/social/` were drawn from memory and must be replaced with official brand-kit marks before production.
17. **Segmented switch relief.** Token `--crown-inset-segment-on` uses 4 px insets; the Portada prototypes render the active EN/ES segment with 2 px insets. Interim: follow the prototype (2 px).
18. **Payment modal avatar upload.** `payment.upload` ("Upload photo or logo") appears in the modal, but locks carry no avatar. Interim: upload only in edit profile.

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

- [ ] **Bug found in M1:** `generate_username()` calls `gen_random_bytes`, but on Supabase `pgcrypto` lives in schema `extensions` and the calling functions pin `search_path = public`, so `resolve_buyer_profile` and `ensure_profile_for_user` fail when creating a profile (every guest purchase and first sign-in). Fix in a new migration (schema-qualify or use `gen_random_uuid()`), covered by a test
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
- [ ] Avatar route `GET /avatar/[username].svg` using `design/lib/avatar-lib.js`, long cache per season; regression test against `assets/avatar/samples`
- [ ] King block: name, flag / country pill, rank tag, message, link (`rel="sponsored ugc noopener"`), Report button (disabled until M7)
- [ ] Reign clock (server timestamps, clock offset from `Date` header)
- [ ] Live price from `public_crown_state` with shared price formula; dropping arrow animation; floor state
- [ ] Home states: locked by someone else (countdown, 20-segment bar, crown shake), empty throne, floor price
- [ ] Line of succession, hall of fame preview, "Proclamations" feed (last 24 h)
- [ ] Footer: stone band + seal, legal links
- [ ] Realtime: `crown_state` updates and `events` inserts → refetch
- [ ] ISR with short revalidate
- [ ] Parameterize copy that hardcodes config values (open question 8)
- [ ] Reduced-motion variants
- [ ] Unit tests (price formula, clock offset, formatting) + e2e smoke; screenshots at 390 / 1440 compared with `Portada*.dc.html`

## Milestone 4 — Lock, test payment provider, webhook, coronation

- [ ] Payment provider interface + `test` provider (simulated checkout page and signed webhook)
- [ ] `POST /api/locks`: zod validation, IP hash, map DB errors to UI states, `set_lock_checkout`
- [ ] `POST /api/locks/[id]/release`
- [ ] `POST /api/webhooks/[provider]`: signature verification, normalize, `record_paid_payment`, refund on `refund_pending`, `mark_payment_refunded`
- [ ] Payment modal (bottom sheet mobile / modal desktop): form, country detection (`cf-ipcountry`), live preview, lock countdown, processing, completed, errors
- [ ] Home states: payment error, lock expired
- [ ] Coronation animation (canvas, 1.8 s, reduced 400 ms fade) triggered by realtime
- [ ] Revalidate home/profile after `applied`
- [ ] Tests: API route unit tests, e2e take the crown as guest, locked state

## Milestone 5 — Auth and profiles

- [ ] Supabase Auth: Google, X, magic link (15 min); auth callback calls `ensure_profile_for_user`
- [ ] Login sheet/modal: interactive, after-payment, link sent (resend after 30 s)
- [ ] Public profile `/u/[username]`: veteran and new-player variants, stats, chronicle, rival, showcase, collection, socials
- [ ] Edit profile `/settings/profile`: sections, save bar states, validation
- [ ] `PATCH /api/profile` with zod; social validation
- [ ] `POST /api/profile/avatar`: type/size check, original max 512 px + 32×32 nearest-neighbor quantized to core palette (sharp), Storage bucket `avatars`
- [ ] Migrations required by open questions 3, 5, 6, 7 (after decisions)
- [ ] Tests: e2e sign in and claim, profile edit; unit tests for validation and image processing

## Milestone 6 — Achievements UI, kingdom, hall of fame, season end

- [ ] Medal component (on/off, rarity ring, seasonal ring by origin season)
- [ ] Achievement unlocked toast (queue, pause on hover/focus, `aria-live`), per-user realtime event
- [ ] `/kingdom`: history timeline by day, size by duration, season filter
- [ ] `/hall-of-fame`: 4 tabs, season / all-time scope, pixel podium
- [ ] `/seasons/[slug]`: King of the Season banner portrait, podium, stats, next season announcement
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
