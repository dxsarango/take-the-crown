# Take the Crown — Technical Spec

Brand name: **Take the Crown**. One crown on the internet: whoever holds it is featured on the homepage. Taking it costs the current price, which rises on every takeover and decays over time. Glory is measured in time reigned. Profiles, ranks, achievements and monthly seasons sit on top.

Operator: Dario Sarango, natural person, Ecuador. Sales go through a merchant of record.

Design source of truth: the design handoff in `/design`. Data and game logic source of truth: `supabase/migrations`. This document explains how they connect.

---

## 1. Stack

- Next.js (App Router, latest stable), TypeScript strict, Tailwind.
- Supabase: Postgres, Auth, Realtime, Storage, pg_cron.
- Hosting: Vercel, proxied through Cloudflare. Enable Vercel spend limits.
- Email: Resend (Supabase Auth SMTP + transactional).
- i18n: next-intl, locales `en` (default) and `es`.
- Share images: `next/og`.
- Image processing: `sharp`.
- Moderation: Anthropic API, `claude-haiku-4-5`.
- Tests: Vitest, Supabase local (CLI), Playwright.
- Package manager: pnpm.

## 2. Game rules

All values live in `app_config` and must never be hardcoded in the app.

| Setting | Default |
|---|---|
| Floor price | $5.00 (500 cents) |
| Increase per takeover | 20% of the price paid |
| Decay | 2% per hour, continuous, compounding |
| Price lock | 300 s |
| Late payment grace | 600 s after lock expiry |
| Max message length | 80 chars |
| Max locks per IP per hour | 5 |
| Public name change cooldown | 30 days |

**Price.** `price(t) = max(floor, ceil(base × (1 − decay)^(hours since base_set_at)))`. On takeover, `base = ceil(price_paid × 1.20)` and `base_set_at = now()`. Empty throne and new seasons start at `floor`. The client computes the live price with the same formula from `public_crown_state`; the server value from `create_price_lock` is authoritative.

**Lock.** Only one active lock. Buying requires a lock; it is created when the buyer submits the payment form, after validation, Turnstile and moderation, and freezes the price for 5 minutes from then. While a lock is active, everyone else sees "Someone is taking the crown…" with its countdown.

**Takeover validity.** A paid payment is applied only if the reign it expected is still current, no other active lock exists, it arrives before `expires_at + grace`, it is in USD for at least the locked amount, the season is open, and the buyer is not the current king. Otherwise it becomes `refund_pending` and the app refunds it through the provider automatically.

**Self-takeover.** The current king cannot buy the crown again.

**Seasons.** A season is open from `starts_at` to `ends_at` (UTC); locks and payments outside that window are rejected or refunded. `rollover_season()` closes the current reign with `season_end`, awards any Guardian tier that reign reached, stores the season king (most total reign time), notifies players with season-start alerts on, and resets the crown to the floor price with an empty throne. The next season must start exactly when the current one ends; otherwise the current season is extended (see below). Current calendar: season 0 Genesis until 2026-12-01 (at least 14 days from launch, `app_config.min_first_season_days`), season 1 Frost (December 2026), seasons 2–11 provisional months (January–October 2027, Genesis art), season 12 Day of the Dead (November 2027). Rollover moves to the season that starts exactly when the current one ends; if none does, the current season runs one more month and the admins are emailed, so the crown never closes for want of a season. Seasons without their final name or art (`name_final`, `art_final`) trigger an admin email `season_ready_alert_days` (30) before they start. The design numbers its art T0 Genesis, T1 Day of the Dead, T2 Frost, so the app maps each season id to its art set. Dates shown in the UI always come from `seasons`, never from copy.

**Prelaunch.** `app_config.prelaunch` (on in a new database): the site is public, but only admins can take the crown, with the test payment provider, to test the flow before launch. Visitors see "Launching soon" in place of the take button. The admin's Launch action shows the resulting season dates, then clears the prelaunch test data, starts Genesis at the chosen time and ends prelaunch; it requires the real payment provider.

**Ranks** (total reign time): Peasant 0, Knight 1 h, Baron 6 h, Count 24 h, Duke 72 h, Emperor 168 h. Reaching a rank publishes a `rank_up` event once per profile per rank (unique in the database), shown in the feed, as a toast to the player and as a share card.

**Achievements.** Evaluated inside the database on each takeover (`award_takeover_achievements`) and every minute for the reigning king (`check_live_achievements`). Seasonal achievements are defined per season via `seasons.exclusive_achievement`. `profile_achievements.season_id` stores where it was earned, which determines the ring color.

| Code | Rarity | Rule |
|---|---|---|
| first_blood | epic | First reign of a season |
| regicide | rare | Dethrone a reign of 24 h+ |
| one_minute_king | common | Dethroned in under 60 s (awarded to the loser) |
| night_owl | common | Take the crown 03:00–04:59 buyer local time |
| revenge | rare | Dethrone whoever dethroned your last reign |
| guardian_1/2/3 | rare/epic/legendary | Reign 12 h / 24 h / 72 h in one reign |
| bargain_hunter | common | Take the crown at the floor price |
| collector | epic | 10 crowns total |
| rivalry | epic | 5 takeovers between the same pair (both get it) |
| patriot | rare | First king ever from your country |
| founder | seasonal (season 0) | Reign during Genesis |
| frostbound | seasonal (season 1) | Reign during Frost (placeholder art) |
| remembered | seasonal (season 2) | Reign during Day of the Dead |

## 3. Data model

Defined in `supabase/migrations` (`0001_init.sql` plus later migrations). Key points:

- `crown_state`: singleton with current reign, price base and active lock.
- `reigns`: one row per reign with snapshots of name, country, message and link. Only one open reign is allowed (partial unique index).
- `price_locks`: buyer input (public name, avatar seed, country, message, link) is stored here before checkout and copied to the reign or new profile on success.
- `payments` + `webhook_events`: idempotency on provider event id and provider payment id.
- `profiles` (public): one public **name** (unique case-insensitive, 3–24 chars of letters, numbers, `.`, `_`, `-`; changeable once every `name_change_days`), `avatar_seed` + optional `avatar_traits`, seven optional links, privacy toggles (`show_rival`, `show_chronicle`, `show_total_spent`). `country_code` may be null ("no country").
- `profile_name_history` (public): former names, reserved for their owner and redirected to the current profile.
- `profile_private` (owner-only): email, locale, admin flag and alerts: `alerts_dethroned`, `alerts_price_below_cents`, `alerts_season_start`.
- `events`: public feed and realtime source. `notifications`: outbox for emails.
- Public views: `public_crown_state`, `public_reigns` (hides moderated messages), `profile_stats` (with rank), `achievement_stats`, `season_leaderboard`, `country_leaderboard`.

Write access: none for `anon`/`authenticated`. They have `SELECT` on public tables and views only (plus their own `profile_private` row) and cannot execute any `security definer` function. All writes go through Next.js server code using the service role and the SQL functions. Never reimplement takeover logic in TypeScript.

## 4. Flows

### Take the crown

1. Client opens the payment modal and generates an `avatar_seed` (32 hex chars) for the live preview. Form: public name with a live availability check (signed-in buyers keep their current name), email (signed out), main link, message, country (detected from `cf-ipcountry`, editable, or none), email if signed out. Client sends its IANA timezone and the seed.
2. `POST /api/locks`: validate input (zod), verify Cloudflare Turnstile, run moderation (§7), then call `create_price_lock`. A moderation rejection returns before any lock exists. Map DB errors to UI states: `crown_locked`, `rate_limited`, `already_king`, `banned`, `season_closed`, `message_too_long`, `name_invalid`, `name_taken`, `avatar_seed_invalid`. The modal's 5:00 countdown starts once the lock is returned.
   - **Known emails.** Only an email with no profile can buy directly as a guest. If a signed-out buyer enters an email that already belongs to a profile (claimed or not), no lock is created: the server sends a magic link to that email and the modal shows the same neutral message in every case ("Check your email to continue"). It never reveals the profile's name or whether the typed name differs. After signing in, the buyer continues as that profile. Paying with someone else's email must never create a reign under their profile; a guest payment whose email gained a profile after its lock was created is refunded.
3. Create the provider checkout with the locked price and `lock_id` in metadata; store it with `set_lock_checkout`. Return the checkout URL or overlay data.
4. If the user closes the checkout, `POST /api/locks/:id/release` calls `release_price_lock`.
5. Provider webhook → `POST /api/webhooks/[provider]`: verify signature, normalize, call `record_paid_payment`. On `refund_pending`, call the provider refund API and then `mark_payment_refunded` when the refund webhook arrives.
6. After `applied`, process pending notifications (§9) and revalidate the home and profile pages.
7. Realtime delivers the change to every open client, which plays the coronation animation. The buyer's page also plays it when the modal learns the lock was applied (`GET /api/locks/:id` returns the reign), so a buyer back from a redirect checkout, whose page loads with the new king already on the throne, still sees it; the same goes for the achievement toasts of that reign. From an empty throne (the first reign of the game or a season) the crown comes down from above onto the new king, on the same beats.

### Guest purchase and claiming

Buying without an account creates or reuses a profile keyed by email (`resolve_buyer_profile`). A new profile gets the lock's name and avatar seed; if the name was taken between lock and payment, it gets a generated `king_xxxxxxxx` name the player can change. On sign-in, the auth callback calls `ensure_profile_for_user`, which claims that profile if the verified email matches, or creates a new one named after the provider's display name when that is a valid, free public name.

### Public names

`is_profile_name_available` backs the live availability check. `change_profile_name` enforces the format, the cooldown and uniqueness, and moves the old name to `profile_name_history`. `/u/[name]` resolves current and former names with `profile_id_for_name` and redirects former ones to the current URL.

### Alerts

All alerts are rows in the `notifications` outbox:

- `dethroned`: inserted by `apply_payment` when the previous king has `alerts_dethroned` on.
- `price_drop`: `queue_price_alerts()` (pg_cron, every minute) inserts one when the live price reaches a player's `alerts_price_below_cents` (whole dollars, $1–$999; the UI enforces at least the floor). At most one per price cycle (`base_set_at`); never for the current king, banned players or a closed season.
- `season_started`: inserted by `rollover_season()` for players with `alerts_season_start` on. The "Remind me" button on the season end page turns that setting on.

A sender processes the outbox right after the webhook and a Vercel cron retries every minute (max 5 attempts).

## 5. Routes

Pages (all under `/[locale]`):

| Route | Screen |
|---|---|
| `/` | Throne room (home) |
| `/u/[name]` | Public profile (lowercased; former names redirect) |
| `/settings/profile` | Edit profile (auth) |
| `/kingdom` | Kingdom history, filter by season |
| `/hall-of-fame` | Hall of fame |
| `/seasons/[slug]` | Season end / summary |
| `/rules`, `/faq`, `/terms`, `/privacy` | Static |
| `/admin` | Admin (profile_private.is_admin) |
| `/alerts/off?token=` | Turn off an email alert (signed link) |

API and assets:

| Route | Purpose |
|---|---|
| `POST /api/locks` | Create price lock + checkout |
| `GET /api/locks/[id]` | Lock status while checkout is open |
| `POST /api/locks/[id]/release` | Release own lock |
| `POST /api/webhooks/[provider]` | Payment webhooks (`dodo`, or `test` locally) |
| `POST /api/reports` | Report the current king's message |
| `GET /api/names/availability?name=` | Live public name check |
| `GET /api/geo` | Country from `cf-ipcountry` for the payment modal |
| `GET /auth/callback` | Magic link / OAuth return: session, claim or create profile |
| `GET /auth/sign-in/[provider]` | Start Google or X sign-in (PKCE); back with `?auth_error=` when the provider is off |
| `POST /api/auth/magic-link` | Email a sign-in link; same answer for every address |
| `POST /auth/sign-out` | Sign out (same-origin form post) |
| `GET /api/me` | Signed-in player's summary for cached pages |
| `POST /api/test-provider/pay` | Test provider only: simulate a completed checkout |
| `PATCH /api/profile` | Update own profile |
| `DELETE /api/profile` | Delete own account (body: the public name, to confirm) |
| `POST /api/profile/remind` | "Remind me": turn on the season-start alert |
| `POST /api/profile/avatar` | Upload avatar |
| `GET /avatar/[name].svg?season=&crown=` | Generated avatar |
| `GET /art/throne/[file]` | Throne room scene per season and size (static) |
| `GET /art/[...path]` | Design handoff pixel assets: flags, icons, seals… (static) |
| `GET /api/time` | Server clock for the client clock offset |
| `GET /api/health` | Uptime check: `{"ok": true}` when the database answers, 503 otherwise |
| `GET /og/[template]/[id]` | Share cards (victory, challenge, achievement, dethroned, rank); `?size=story` for 1080×1920, `?locale=` |
| `GET /og/mail/[id]` | Dethroned email header image |
| `GET /og/flag/[code].png` | Pixel flag as PNG for emails |
| `POST /api/alerts/off?token=` | One-click unsubscribe from an alert email |
| `GET /api/cron/notifications` | Email outbox (Vercel cron, secret-protected) |
| `GET /api/cron/moderation` | Retries quarantined moderations (Vercel cron every minute, secret-protected) |

## 6. Realtime and time

- Subscribe to `crown_state` updates and `events` inserts. On change, refetch `public_crown_state` and the current reign.
- Timers and the live price are computed on the client from server timestamps. On load the client calls `GET /api/time` and takes the offset between the server clock and the midpoint of the round trip (millisecond precision, unlike the `Date` header), then applies it everywhere. A lock expiring needs no event: the client drops the lock state when its countdown reaches zero.
- Home is rendered with ISR (short revalidate) and hydrated with realtime, so traffic spikes hit the CDN, not the database.

## 7. Moderation and links

Before creating a lock:

- Links must be `https`. Block URL shorteners, chat invite domains (Telegram, Discord, WhatsApp), and a maintained blocklist.
- Profiles have seven optional links. The form accepts a handle or a URL; the server normalizes it and stores one canonical URL, which the database also checks:

  | Link | Stored as |
  |---|---|
  | Website | any `https://` URL on a real domain, max 200 chars |
  | X | `https://x.com/<handle>` (accepts `twitter.com` input) |
  | YouTube | `https://youtube.com/@<handle>` |
  | TikTok | `https://tiktok.com/@<handle>` |
  | Instagram | `https://instagram.com/<handle>` |
  | GitHub | `https://github.com/<user>` |
  | LinkedIn | `https://linkedin.com/in/<slug>` |
- Message, public name and link go through `claude-haiku-4-5` with a strict JSON verdict (`allow`, or `reject` with the field and a reason code: hate, harassment, sexual, violence, self_harm, illegal, scam, gambling, impersonation, personal_data, spam, manipulation). Reject → no lock, no charge, reason shown in the modal. The same check runs when a player saves a new public name or product link.
- Player text is untrusted: it is HTML-escaped and wrapped in `<submission>` tags, and the prompt tells the model to classify it and never follow it; attempts to instruct the moderator are rejected as `manipulation`.
- The model is only called after the human check (Turnstile) and the hourly rate limits pass (`max_moderations_per_ip_per_hour` on takeovers, `max_profile_saves_per_hour` on profile saves), and on profile saves only when the name or product link changed.
- No verdict after two attempts (timeout, API error, refusal, invalid answer): the takeover goes ahead with its message and link quarantined (`moderation_status = 'pending'`, hidden by `public_reigns`) and the buyer sees "Your message will appear after a short review." `GET /api/cron/moderation` retries pending reigns every minute: approved content becomes visible, rejected content stays hidden. A profile save without a verdict is refused ("try again").
- Public names are never quarantined: the rules layer checks them against a word blocklist (impersonation of staff or the brand, slurs, hate symbols; leetspeak-normalized) before the model.
- All user links render with `rel="sponsored ugc noopener"` and `target="_blank"`.
- Reports carry a reason (offensive, scam, spam) and are one per IP per reign (`report_reign`). Reports never hide anything by themselves; the third report on a reign queues a `reports_threshold` email to the admins. Admins can set `reigns.message_hidden` (no refund). Every admin action is recorded in `admin_actions`.

## 8. Avatars and images

- The throne room is one static SVG per season and size, generated by ports of the design's scene generators and wider than any screen, centered so it grows sideways. The current king's portrait (rank frame + avatar with the season crown) is drawn over the seat at the same integer scale: ×4 below 1024 px, ×6 above.
- Generated avatars reuse the design handoff's `avatar-lib.js`: traits come from `traitsFromUsername(avatar_seed)` with `avatar_traits` overrides on top (validated against the library's layers), so renaming never changes the avatar. Edit profile has a per-layer editor. Served as SVG with long cache headers keyed by season.
- Uploads (edit profile only): PNG, JPG or WebP up to 5 MB (checked by decoding, not by the declared type), in the public Supabase Storage bucket `avatars` under `<profile id>/<upload id>/`. Keep the original (max 512 px, WebP) and a pixelated version (`pixel.png`): center crop, resize to 32×32 with nearest neighbor and quantize to the core palette. The profile chooses which one to show; the season crown is drawn on top of either, and the coronation uses the pixelated one.
- Share cards with `next/og`, sizes 1200×630 and 1080×1920, cached at the edge. Pixel art is embedded as PNG rendered at integer scale.

## 9. Email

- Supabase Auth magic links through Resend SMTP.
- Transactional templates (en/es, user locale): dethroned, price drop, season started, and the 3-report alert for admins. Built with react-email using the design handoff's template.
- Outbox: `claim_notifications` hands each sender a batch (a claim is an attempt); `mark_notification_sent` / `mark_notification_failed`; after `app_config.max_email_attempts` a notification is given up. Alerts are re-checked at send time; a price drop whose price is back above the threshold is skipped.
- Every alert email carries a signed "turn off" link (`/[locale]/alerts/off`, asks before changing anything) and one-click `List-Unsubscribe` headers (`POST /api/alerts/off`).
- Images in emails are PNG: the dethroned header (`/og/mail/[id]`, ×12 for exact downscales to 440 and 330 px) and pixel flags (`/og/flag/[code].png`).

## 10. Payments

The provider is **Dodo Payments** (merchant of record), behind a provider interface, plus a local `test` provider:

```ts
interface PaymentProvider {
  createCheckout(input: { lockId: string; priceCents: number; email: string; locale: string; successUrl: string; cancelUrl: string }): Promise<{ checkoutId: string; url: string; mode: "overlay" | "redirect" }>;
  verifyWebhook(req: Request): Promise<NormalizedEvent | null>;
  refund(providerPaymentId: string): Promise<void>;
}
```

Requirements for the chosen provider: custom price per checkout, metadata passthrough, signed webhooks, refund API. `createCheckout` also says whether checkout opens as an overlay inside the payment modal or as a redirect. The `test` provider simulates checkout and webhooks locally and is used in e2e tests: its checkout is an overlay with Pay and Decline, paying posts an HMAC-SHA256-signed webhook (`x-test-signature`, `PAYMENT_WEBHOOK_SECRET`) to `/api/webhooks/test`, and refunds are confirmed by a webhook too. It refuses to run in production.

**Dodo Payments.** One one-time product with Pay What You Want on; its price is the minimum Dodo accepts, and `app_config.floor_cents` may never go below it (the admin refuses such a floor, reading the minimum from Dodo's product API). Each checkout session (`POST /checkouts`) passes the locked price from `create_price_lock` in `product_cart[].amount` (cents, never from the client), `billing_currency: "USD"`, the buyer's email, `metadata.lock_id`, and return and cancel URLs back to `/{locale}?lock=…`. Checkout is Dodo's hosted page (redirect); back home, the payment modal follows the lock until the webhook crowns the buyer, and a cancelled checkout releases the lock.

Webhooks (`POST /api/webhooks/dodo`) are verified with the Standard Webhooks scheme (HMAC-SHA256 over `webhook-id.webhook-timestamp.body`, `v1` signatures, five-minute tolerance) using `DODO_WEBHOOK_SECRET`. `payment.succeeded` → `record_paid_payment` (event id = `webhook-id`, lock from `metadata.lock_id`, else from the checkout session stored by `set_lock_checkout`); `refund.succeeded` → `mark_payment_refunded`; `dispute.*` → `record_payment_dispute`; other events are acknowledged and ignored.

**Reversals after delivery.** A refund of a payment whose crown was delivered (the provider's, or an admin's manual refund), or a chargeback (a dispute opened, accepted or lost), reverses the reign (`reverse_payment`): it stays in the public history marked as refunded, its message and link are hidden, a reigning king leaves the throne at once (the price stays), it stops counting toward statistics, leaderboards, ranks (rank-ups no longer reached are removed), records, King of the Season and future achievements, and the achievements earned through it are revoked. A chargeback also suspends the buyer's profile. Challenged, won, cancelled and expired disputes are only recorded on the payment; an admin decides whether to lift the suspension. A refund we requested before delivery (`refund_pending`) had no reign and only closes the payment. `/admin` lists reversed reigns. On `refund_pending` the route calls Dodo's refund API (`POST /refunds`). Test and live modes (`DODO_MODE`) have separate keys, products and webhooks; on a deployment, test payments (test provider or Dodo test mode) only work during prelaunch, and launch is refused while payments are in test mode.

Checkout terms shown before paying: payments are final; buyers pay for visibility, not a prize.

## 11. Security and abuse

- Cloudflare proxy with WAF, bot protection and rate limiting on `/api/*`. Turnstile (invisible unless Cloudflare asks for an interaction) on lock creation and profile saves; tokens are checked server-side for the same action.
- App-level hourly limits from `app_config`: locks and moderation calls per IP, profile saves and avatar uploads per player, sign-in links per IP and per email, reports per IP.
- Client IPs come from Vercel's headers; Cloudflare's `cf-connecting-ip` and `cf-ipcountry` count only with the `x-origin-secret` header a Cloudflare Transform Rule adds (`CLOUDFLARE_ORIGIN_SECRET`).
- Cookie-authenticated API routes refuse requests whose `Origin` is another site. Sign-in redirects (`next`) only go to same-site paths.
- The test stand-ins for payments, email and moderation refuse to run on any Vercel deployment.
- Retention (privacy policy §8): a daily job clears IP hashes on locks and reports after 90 days, limit hits after a day, and sent or failed emails after 90 days.
- IPs are stored only as salted SHA-256 hashes (`IP_HASH_SALT`).
- Service role key only in server code. RLS on every table. Clients read public tables only; `profiles.user_id` and `profile_private` are not readable by them. New tables, views and functions start with no client access; each migration grants what it needs explicitly.
- Webhook signature verification is mandatory; never trust client payment status.
- Strict CSP; no third-party scripts beyond the payment provider and Turnstile. Pages get a per-request nonce with `'strict-dynamic'` (set in `proxy.ts`; pages render per request, the home page's data is cached), `object-src` and `base-uri` none, `frame-ancestors 'none'`. Every response also sends HSTS, `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy and a permissions policy.

## 12. i18n

All UI strings in `messages/en.json` and `messages/es.json`. Locale from path, then cookie, then `Accept-Language`. Prices always in USD, formatted per locale. Season names come from `seasons.name_en/name_es` and season dates from `seasons`. The brand name is a single config constant inserted into copy through a placeholder, never written into messages.

## 13. Admin

Minimal, server-rendered: current crown and lock, recent payments with status and a manual refund action, reports queue with hide message and ban user, content in review (held or rejected by moderation: approve, including rejected items to fix false positives, or reject held items with a reason), release a reserved former name (`release_profile_name`), seasons list, `app_config` editor.

## 14. Legal pages

Operator: Dario Sarango (natural person, Ecuador). Governing law: Ecuador. Privacy policy covering Ecuador's personal data protection law (LOPDP) and GDPR basics. The drafts in `docs/legal` (en/es) must be reviewed by a lawyer.

- `/rules`, `/faq`, `/terms`, `/privacy` render `docs/legal/<page>.<locale>.md`, filling in the brand, the domain, the game rules from `app_config` (floor, step, decay, lock and grace minutes, message length) and the legal details from `app_config` (contact email, city, payment provider, effective date; editable in admin, shown as placeholders until set).
- Checkout requires ticking "the crown is delivered right away and I lose the right of withdrawal once it is delivered", linked to terms §5; the server refuses a lock without it and records the time on the lock.
- Account deletion in edit profile (type the public name to confirm; needs a sign-in within the last 10 minutes, otherwise a sign-in link is emailed first): the profile becomes "Former king" (reserved name `former~<hex>`, the silhouette avatar, no profile page), its reigns stay without name, message, link or country, private data and alerts are deleted, the sign-in user and uploaded avatars are removed. Payments and their locks stay for tax law. A checkout in progress is cancelled and its late payment refunded.

## 15. Testing

- Unit: price formula (client implementation must match `price_at`), rank thresholds, link validation, moderation parsing.
- Local development: `supabase db reset` applies the migrations and then `supabase/seed.sql`, which opens the current season so the crown can be taken before the real launch date. The seed is local only and is never pushed to hosted projects.
- Database (`pnpm test:db`, against local Supabase after `supabase start`; pauses pg_cron while running): lock contention, duplicate webhooks, late payments inside and outside grace, self-takeover, season rollover, every achievement rule, guest claim, public names, links, alerts, and client privileges (anon and authenticated can't write or call `security definer` functions).
- Concurrency: parallel `record_paid_payment` calls for different locks; exactly one reign must result.
- E2E (Playwright, `test` provider): take the crown as guest, sign in and claim, dethroned flow, locked state, profile edit, locale switch.

## 16. Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET` (test provider), `DODO_MODE`, `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_PRODUCT_ID`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_LINK_SECRET`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `CLOUDFLARE_ORIGIN_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`.

## 17. Build order

Each milestone ends with passing tests and a short summary.

1. Project scaffold, Tailwind tokens from the design handoff, i18n, local Supabase with migrations.
2. Database test suite for the migrations (§15).
3. Read-only home: throne, timer, price, succession line, hall of fame preview, feed, realtime.
4. Lock + `test` payment provider + webhook + coronation animation.
5. Auth (Google, X, magic link), guest claim, profile page, edit profile, avatar upload.
6. Achievements UI, unlock toast, kingdom history, hall of fame, season end.
7. Moderation, reports, admin.
8. Share cards, email outbox, dethroned alert.
9. Security hardening (Turnstile, rate limits, CSP), legal pages.
10. a) Production in prelaunch (`docs/DEPLOY.md`), b) real payment provider, staging, end-to-end run with small real payments, launch.

## 18. Open items

- Payment provider approval (compliance review of the prelaunch site at takethecrown.app).
- Launch date (set by the admin's Launch action).
- Seasons for January–October 2027, and Frost's final art.