# Security audit report

Audit of `docs/audits/SECURITY.md`, run on 2026-10-07 against `main` at `f31e4dc` (Next 16.3.6, React 19.2.8, local Supabase with GoTrue v2.197.0). Nothing was scanned or load-tested in production; the commands for the owner are at the end.

Statuses: **verified** (with the test or evidence), **fixed** (with the PR and its tests), **finding (low)** (listed for the owner, not fixed), **owner** (needs an account; in the checklist at the end).

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| C1 | Critical | Supabase's sign-up API accepts passwords from anyone with the anon key: someone could register a player's email with their own password, get a session for it (with "Confirm email" off) and claim the guest profile bought with that email, or keep a password that stays valid after the owner confirms the account | fixed, [#32](https://github.com/dxsarango/take-the-crown/pull/32) |
| H1 | High | `crown_state.active_lock_id` was readable by clients (REST and Realtime); the lock id is all `/api/locks/<id>/release` needs, so anyone could release a buyer's lock during checkout and get their payment refunded | fixed, [#33](https://github.com/dxsarango/take-the-crown/pull/33) |
| H2 | High | Next 16.3.6 is affected by the 2026-09-30 advisories, including SSRF in Image Optimization (the `/_next/image` route exists although `next/image` is unused) | fixed, [#34](https://github.com/dxsarango/take-the-crown/pull/34) |
| M1 | Medium | Supabase auth cookies were readable by scripts (`httpOnly: false` default) although the browser never needs them | fixed, [#35](https://github.com/dxsarango/take-the-crown/pull/35) |
| M2 | Medium | No `error.tsx`, `not-found.tsx` or `global-error.tsx`: errors showed Next's bare defaults | fixed, [#38](https://github.com/dxsarango/take-the-crown/pull/38) |
| M3 | Medium | Messages kept direction overrides, zero-width and control characters (text could display differently from what moderation read) | fixed, [#36](https://github.com/dxsarango/take-the-crown/pull/36) |
| M4 | Medium | COOP allowed popups for a checkout overlay no longer used; no CORP; no `noindex` on the API; no `security.txt` | fixed, [#37](https://github.com/dxsarango/take-the-crown/pull/37) |
| M5 | Medium | No emergency pause and no incident runbook | fixed, [#40](https://github.com/dxsarango/take-the-crown/pull/40) |
| M6 | Medium | Nobody was told when a chargeback opened; refund retries and two-step verification events were missing from the admin log | fixed, [#39](https://github.com/dxsarango/take-the-crown/pull/39) |
| M7 | Medium | Nothing checked the client bundle for server secrets (the audit assumed `check:deploy` did) | fixed, [#41](https://github.com/dxsarango/take-the-crown/pull/41) |
| L1–L14 | Low | See "Low findings" | listed |

Merge order: the migrations are numbered in sequence across branches, so merge #32 (`0027`), #33 (`0028`), #39 (`0029`) and #40 (`0030`) in that order; the others in any order. Run `supabase db push` after each migration PR (DEPLOY, "After merging a PR with a migration").

## A01 Broken access control

- **Authorization in the data layer, not the proxy — verified.** `proxy.ts` only does locale routing, the session refresh and the CSP nonce; it never decides access. Every protected page, route and action checks the session itself: `currentViewer()` (profile, settings, deletion, avatar, remind, names), `adminAccess()` in `/admin` and in every admin action. A proxy bypass therefore exposes nothing. Next advisories for proxy bypass: none affects 16.3.x (fixed in 16.2.5–16.2.11, see A03).
- **Server actions are public endpoints — verified.** Two files: `app/[locale]/admin/actions.ts` (every action calls `admin(form)` or `adminAccess()` first: admin role, sign-in within 12 h, TOTP; sensitive ones a sign-in within 10 min; inputs parsed with zod) and `app/[locale]/alerts/off/actions.ts` (HMAC token, constant-time compare). Tests: `tests/unit/admin-guard.test.ts` (non-admin → null, stale, enroll, verify, recent), `e2e/admin-security.spec.ts` (no panel without TOTP; sensitive action refused and re-authentication emailed after 10 min), `e2e/moderation-admin.spec.ts` ("is invisible to everyone but admins": 404 signed out and as a player), `tests/unit/email.test.ts` (alert tokens).
- **IDOR — verified.** Profile, settings, avatar, deletion and remind act only on the signed-in viewer's profile (no id taken from the client). Admin-only ids go through the admin checks. Lock ids are unguessable capabilities (UUID v4) known only to the buyer, and after #33 no longer readable by anyone else. Reports take a reign id but only record one report per IP hash (`tests/db/admin.test.ts`). Avatar paths are checked to belong to the profile in `update_profile` (`tests/db/profile-edit.test.ts`).
- **Header trust — verified.** Cloudflare's `cf-connecting-ip` and `cf-ipcountry` count only with a valid `x-origin-secret` (constant-time); otherwise Vercel's own headers. `x-middleware-subrequest`, `x-user-id` and similar are never read. `sameOrigin` uses the host only to compare with `Origin`, which browsers set. Tests: `tests/unit/security.test.ts` (spoofed Cloudflare headers ignored without the secret, wrong secret, country sources), `e2e/security-legal.spec.ts` (cross-site POST refused).
- **Absolute URLs from `NEXT_PUBLIC_SITE_URL` — verified.** Magic links and OAuth callbacks (`lib/auth/magic-link.ts`), checkout return URLs (`lib/locks/create.ts`), emails (`lib/email/outbox.ts`), sitemap, robots, metadata. The auth routes redirect to relative paths on the request's own host, after `safeNext`.
- **Open redirects — verified.** Every `next` goes through `safeNext` (magic link, sign-in, callback, sign-out); admin redirects only use a validated locale. Tests: `tests/unit/security.test.ts` (`safeNext` with `//`, `\`, tabs, schemes), `e2e/security-legal.spec.ts` ("never redirects outside the site after signing in").
- **Supabase RLS — verified, extended by #33.** RLS on every table; anon and authenticated read only the allowlist, write nothing and execute only `current_price_cents`, `price_at`, `profile_id_for_name` and `rank_for_seconds` (all security invoker). Private tables (`profile_private`, `payments`, `price_locks`, `notifications`, `reports`, `admin_actions`) are unreadable; `public_reigns` hides held and hidden messages and links. Tests: `tests/db/security.test.ts`, `tests/db/deploy-checks.test.ts`. #33 adds to `check:db` / `check:deploy`: no client write privilege, no callable function outside the allowlist or any security definer one, and no client read of `profiles.user_id` or `crown_state.active_lock_id`.
- **Storage — verified.** `avatars` is public-read with a 1 MB limit and PNG/WebP only; `storage.objects` has no policies, so clients cannot list or upload; uploads go through `/api/profile/avatar`, which decodes and re-encodes the image with sharp (content, not extension) under a per-profile folder and an hourly limit.
- **Realtime — verified, fixed by #33.** Published tables: `crown_state` and `events` only. Event payloads hold public data (achievement code, price, previous king, durations, season slug). `crown_state` carried `active_lock_id` until #33; Realtime drops columns a role cannot select.

## A02 Security misconfiguration

- **Supabase Security and Performance Advisors — owner.** Not reachable from here (the connector does not list the production project).
- **Supabase Auth settings — owner,** with DEPLOY updated in #32: keep "Confirm email" on. Redirect allowlist: DEPLOY currently says `https://takethecrown.app/**`; narrow it to `https://takethecrown.app/auth/callback**` plus the local URL (finding L12). Site URL and templates per DEPLOY step 3.
- **Cloudflare TLS, HSTS, DNSSEC, registrar lock — owner.** HSTS from the app is `max-age=63072000; includeSubDomains`; set Cloudflare's HSTS to the same or leave it off so the two do not disagree.
- **Security headers — fixed, #37.** Existing ones verified by `check:deploy` and `e2e/security-legal.spec.ts`. Added: `Cross-Origin-Opener-Policy: same-origin` (checkout is a redirect now), `Cross-Origin-Resource-Policy: same-origin` with `cross-origin` on `/og`, `/art`, `/avatar`, `/icons` (email and share images), `X-Robots-Tag: noindex` on `/api` and `/auth`.
- **No stack traces — verified and fixed, #38.** Route handlers answer generic JSON; production Next hides error details; #38 adds error pages that show only a retry and a way home (unit test: the error's message never renders).
- **robots and noindex — verified.** `robots.txt` disallows `/api/`, `/auth/`, `/*/admin`, `/*/settings/`, `/*/alerts/`; admin, settings and alerts pages set `robots: noindex`; #37 adds the API header.
- **security.txt — fixed, #37.** Expires 2027-10-01; `check:deploy` warns 60 days before.
- **`*.vercel.app` — fixed (low, L9).** It bypassed Cloudflare (WAF, rate-limit rule, origin secret). The proxy now redirects (308) every request whose host is not the one in `NEXT_PUBLIC_SITE_URL` to the canonical domain, in production only (`next dev` and Vercel previews are exempt). Vercel Cron calls the deployment directly, so `/api/cron/*` with a valid `CRON_SECRET` is served on any host; the secret opens nothing else. Tests: `tests/unit/canonical-host.test.ts`; `e2e/canonical-host.spec.ts` against a production build (`pnpm e2e:prod`) runs the three cron routes on a foreign host with and without the secret. After deploying, confirm in Vercel → Logs that the crons still answer 200.

## A03 Software supply chain failures

- **Next and React — fixed, #34.** 16.3.6 is affected by GHSA-cjq9-62q9-8jv4 (high, SSRF in Image Optimization), GHSA-f87g-xv8r-7p7x (metadata image routes), GHSA-mcj8-r9mp-w47p and GHSA-4jqv-mc3x-m676 (SSG/ISR cache poisoning), GHSA-3w37-wq28-93x7 and GHSA-h694-7cp9-m8p3 (`use cache`, unused here), GHSA-39w2-rjm5-chcv (dev server). 16.3.8 is the latest 16.3 release; the 2026-09-30 advisories list their 16.3 fix version incompletely, so check the advisory pages again after merging. The 2026 proxy-bypass advisories (GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6, GHSA-492v-c6pp-mqqv, GHSA-6gpp-xcg3-4w24, GHSA-36qx-fr4f-26g5) and the next/og RCE (GHSA-vcvr-r3jv-pc5j) are fixed in 16.3.6 already. React 19.2.8 is the version that fixes the latest React advisory (GHSA-wx67-qw84-cm4g, Server Functions DoS); none open for it.
- **`pnpm audit` — fixed or justified, #34.** `source-map-js` overridden to >=1.2.2 (build time). `braces` ≤3.0.3 remains: reached only through `eslint-config-next` → `fast-glob` at dev time, never with user input, no patched release (L10).
- **Dependabot, frozen lockfile, minimum release age — fixed, #34.** `.github/dependabot.yml`; `minimumReleaseAge: 1440`. The lockfile is committed; Vercel installs with the frozen lockfile in CI. There is no GitHub Actions workflow yet (nothing to pin).
- **GitHub secret scanning, push protection, branch protection — owner.**
- **Next patch review — verified, #34.** Ported to 16.3.8 because the write is still non-atomic there (decision 47).

## A04 Cryptographic failures

- **No secrets in the client bundle — fixed, #41.** The check the audit refers to did not exist; only `server-only` on `lib/env.server.ts` guarded it. #41 adds the scan to `check:deploy` (the deployed home page's chunks) and `pnpm check:bundle` (a local build, compared with the real values in `.env.local`). Local build: PASS, 25 chunks, 8 values checked.
- **IP hash salt — verified; rotation is L11.** `hashIp` uses `IP_HASH_SALT`; rotation resets rate limits and report de-duplication (now in `docs/INCIDENTS.md`).
- **Signed tokens — verified, one finding (low, L1).** Alert links: HMAC-SHA256, `timingSafeEqual`, purpose-bound (`alert-off:<profile>:<kind>`); they never expire, by design (RFC 8058 one-click unsubscribe; the action only turns an alert off). Cron and origin secrets also compare in constant time.
- **Cookies — fixed, #35.** `sb-` cookies are now `HttpOnly`, `SameSite=Lax`, `Secure` on https; no other cookie holds sensitive data (`tz` holds the time zone).

## A05 Injection

- **SQL — verified.** Only the Supabase query builder and RPC with parameters; no string-built SQL in `app/` or `lib/`, no `execute format` in migrations, no `.or()`/`.filter()` strings with user input.
- **XSS — verified.** No `dangerouslySetInnerHTML` with user data: the four uses render SVG built from pixel arrays (palette colors, decoded RGB, or traits validated by `is_valid_avatar_traits`). User text renders as React text in pages, share cards (satori) and emails (React email templates). Names are `[A-Za-z0-9._-]{3,24}`, so no HTML, bidi or homoglyphs; "admin", the brand and slurs are blocked (`name-blocklist.ts`, leetspeak-normalized). Messages: #36 drops bidi, zero-width and control characters (unit tests); moderation catches tags and markers (decision 51).
- **Links — verified.** Only `https:` with a real domain, no credentials or ports (`linkProblem`, `isHttpsUrl`; tests in `tests/unit/moderation.test.ts`); rendered with `rel="sponsored ugc noopener"`. They are validated on write and again on render (`safeHttpsUrl`, L7).
- **Emails — verified.** Templates escape through React; subjects only interpolate names (restricted charset) and numbers; sent as JSON to Resend, so no header injection.
- **Share cards — verified.** `next/og` renders text nodes; images come from our own routes or the avatar bucket by stored path; the next/og RCE (GHSA-vcvr-r3jv-pc5j) is fixed in 16.3.6+.
- **Prompt injection — verified.** Rules layer before the model, escaping of every field, hardened prompt and a 5-run live suite (decision 51, `tests/unit/manipulation.test.ts`, `tests/live/moderation.live.test.ts`).

## A06 Insecure design

- **Price integrity — verified.** Amount from the lock; `apply_payment` refunds underpayment, other currencies, late or out-of-season payments; signatures, replay window and idempotency (`tests/db/payments.test.ts`, `tests/db/concurrency.test.ts`, `tests/unit/dodo.test.ts`).
- **Abuse cases — verified.** Lock griefing: one active lock, per-IP hourly lock limit, Turnstile, and #33 for the release path (`tests/db/locks.test.ts`). Magic-link floods: per IP and per address (`e2e/security-legal.spec.ts`). Report floods: one per IP per reign plus an hourly limit (`tests/db/admin.test.ts`, `e2e/security-legal.spec.ts`). Name squatting: old names reserved for their owner, release by admin (`tests/db/names.test.ts`). Avatar uploads: hourly limit, size, decoded content. Card testing: every payment is at least the $5 floor, behind Turnstile and the lock limit; Dodo's own fraud checks apply. Self-dealing: every takeover costs real money at a rising price; farming achievements between two accounts is possible only at full price (accepted by design).
- **Emergency pause and runbook — fixed, #40.**

## A07 Authentication failures

- **No password sign-in — fixed, #32.** Supabase has no switch to turn passwords off while keeping email links, and its sign-up API is open. The app now refuses any session whose verified `amr` includes `password`, and the callback voids any password set on the account and ends password sessions when the owner signs in (`forget_password_access`, migration `0027`). Tests: db, unit, and e2e against local Supabase Auth (a password session is refused and its cookies deleted; a pre-set password and its refresh token stop working after the owner's sign-in).
- **Admin — verified.** TOTP required, 12-hour sign-in, 10-minute re-authentication for sensitive actions (decision 49, `e2e/admin-security.spec.ts`). Admin list review — owner (SQL in the checklist).
- **Magic links — verified.** Supabase single-use links, 900 s expiry (DEPLOY step 3), per-address and per-IP limits, and the same answer whether or not the address has an account (`app/api/auth/magic-link/route.ts`, `e2e/security-legal.spec.ts`).
- **Session revocation — verified, two findings (low).** Deletion deletes the auth user and its sessions (`lib/profile/delete.ts`, `e2e/security-legal.spec.ts`). Sign-out ends this device only (decision in #24). Suspending a profile now ends all its sessions and blocks profile edits (L5, migration `0031`); there is no "sign out everywhere" for players (L6, moved to `docs/IDEAS.md`).
- **OAuth — verified.** PKCE through Supabase (`e2e/auth.spec.ts`: Google and X hand off with a `code_challenge`); callback URLs fixed to Supabase's; provider errors logged (decision 50).

## A08 Software or data integrity failures

- **Webhooks — verified.** Signature over the raw body before parsing, timestamp window, secret rotation, unknown events answered as ignored (`lib/payments/dodo.ts`, `tests/unit/dodo.test.ts`).
- **Migrations — verified, owner.** Only through migration files and `supabase db push` (DEPLOY, `docs/INCIDENTS.md`); no manual dashboard edits is a practice for the owner.
- **Cron secret — verified.** `cronAuthorized` compares `Bearer <CRON_SECRET>` in constant time and fails closed without a secret (`check:deploy` and `e2e/refunds.spec.ts` check the 401).

## A09 Security logging and alerting failures

- **Error monitoring — owner (in progress).** Not in the code yet; Vercel logs hold every `console.error`.
- **Admin audit log — fixed, #39.** Every admin action is logged with actor, time and target; #39 adds refund retries and TOTP events.
- **Alerts — partly fixed.** Refunds stuck (existing), disputes opened (#39), reports threshold (existing), failed TOTP codes in the log (#39). Moderation unavailable and rate-limit spikes have no alert yet (L13): they belong in the error monitoring.
- **Logs without personal data — verified, fixed (low, L3).** No log line formats an email, token, IP or secret. Error messages from providers (Dodo, Resend, Supabase Auth, the moderation model) pass through `redactEmails` before they are logged or stored in the refund and notification error columns.

## A10 Mishandling of exceptional conditions

- **Timeouts and fail-closed behavior — verified, one fix and one finding (low).** Dodo 15 s, Anthropic 10 s with one retry (no verdict → content held, `tests/unit/moderation.test.ts`), Resend 10 s (outbox retries), Turnstile 5 s (fails closed in production, `tests/unit/security.test.ts`), the OAuth provider check now 5 s (#32). The service role now has a 30 s `statement_timeout` like the client roles (L4, migration `0031`).
- **Partial failures — verified.** No crown without a payment (only `apply_payment` creates reigns); a payment that cannot crown is refunded and retried (`tests/db/payments.test.ts`, `tests/db/refunds.test.ts`).
- **Error boundaries — fixed, #38.**

## Low findings

| # | Finding | Recommendation |
|---|---|---|
| L1 | Alert turn-off links never expire | **Accepted.** RFC 8058 one-click links must keep working, and the action only turns an alert off |
| L2 | `/api/names/availability` has no rate limit | **Fixed**: per-IP hourly limit from `app_config.max_name_checks_per_ip_per_hour` (default 600, migration `0031`); malformed names cost nothing |
| L3 | Dodo and Resend error messages are logged as received and could include an email | **Fixed**: `lib/security/redact.ts` |
| L4 | Supabase calls have no client-side timeout (anon and authenticated have statement timeouts; the service role does not; Vercel stops a function at 300 s) | Set a `statement_timeout` for the service role, or abort signals on hot paths |
| L5 | A suspended account keeps its sessions and can still edit its profile (moderated) | **Fixed**: a trigger deletes the sessions when `is_banned` turns true (admin action and chargeback alike); `update_profile` refuses suspended profiles |
| L6 | No "sign out of all devices" for players | **Post-launch**: in `docs/IDEAS.md` |
| L7 | Links are checked when written, not when rendered | **Fixed**: `safeHttpsUrl` on every rendered link |
| L8 | Someone holding a pre-hijack password session could enroll a TOTP factor on an admin who has none yet, locking that admin out | Enroll TOTP on every admin before launch; the SQL reset is in DEPLOY step 7 |
| L9 | `*.vercel.app` bypasses Cloudflare | **Fixed**: the app redirects other hosts to the canonical domain, crons excepted |
| L10 | `braces` advisory remains (dev only, no fix) | **Accepted**; recheck when `eslint-config-next` updates |
| L11 | `IP_HASH_SALT` never rotates | **Accepted**; rotate yearly if wanted (it resets limits and report de-duplication) |
| L12 | Supabase redirect allowlist `https://takethecrown.app/**` | Narrow to `https://takethecrown.app/auth/callback**` and the local URL |
| L13 | No alerts for moderation outages or rate-limit spikes | Add with the error monitoring |
| L14 | `/api/test-provider/pay` pays any lock id while the test provider is active | **Accepted**: only active locally or in prelaunch with the test provider; nothing to do once Dodo is live |

## Commands for the owner

Run these yourself (production, not from this machine):

- Mozilla HTTP Observatory: https://developer.mozilla.org/en-US/observatory/analyze?host=takethecrown.app
- securityheaders.com: https://securityheaders.com/?q=https%3A%2F%2Ftakethecrown.app&followRedirects=on
- SSL Labs: https://www.ssllabs.com/ssltest/analyze.html?d=takethecrown.app&hideResults=on
- OWASP ZAP baseline (passive, prelaunch; Cloudflare may challenge it, so allow your IP in a WAF skip rule for the run):

  ```bash
  docker run --rm -v "$PWD:/zap/wrk" -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://takethecrown.app -r zap-baseline.html
  ```

- After the PRs are merged and deployed:

  ```bash
  CHECK_DATABASE_URL="<Session pooler connection string>" pnpm check:deploy https://takethecrown.app
  ```

## Owner checklist

- [ ] `supabase db push` for the migrations that are not on production yet (`0029`–`0031` at the time of writing); then `pnpm check:deploy` with `CHECK_DATABASE_URL`.
- [ ] Supabase → Advisors: Security and Performance on production, zero errors; note the warnings in this report.
- [ ] Supabase → Authentication: "Confirm email" on; redirect URLs narrowed (L12); site URL `https://takethecrown.app`; templates per DEPLOY; rate limits reviewed; TOTP enabled; Sessions per DEPLOY (Pro).
- [ ] Review the admin list: `select p.name, pp.email from profile_private pp join profiles p on p.id = pp.profile_id where pp.is_admin;` No test or shared admins. Every admin sets up TOTP before launch (L8).
- [ ] Cloudflare: SSL/TLS Full (strict), Always Use HTTPS, minimum TLS 1.2, HSTS consistent with the app's header (or off), DNSSEC on; registrar lock on the domain.
- [ ] Vercel: after the deploy, confirm the crons still answer 200 in Logs (L9); no domain redirect is needed in Vercel.
- [ ] GitHub: secret scanning and push protection on; Dependabot alerts on; branch protection on `main` if the plan allows.
- [ ] Error monitoring with alerts for webhook, payment, moderation, auth and cron errors (L13).
- [ ] Record the Observatory, securityheaders.com and SSL Labs grades here, and the ZAP baseline findings.
- [ ] 2FA with an authenticator app on GitHub, Vercel, Supabase, Cloudflare, Dodo, Resend, Anthropic, Google Cloud, the X developer account and the domain registrar; recovery codes stored; no shared passwords; secrets only in Vercel and `.env.local`.
- [ ] Renew `public/.well-known/security.txt` before 2027-10-01.
