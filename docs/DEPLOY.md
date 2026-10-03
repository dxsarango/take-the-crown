# Production deploy (M10a: prelaunch)

The ordered steps to put `takethecrown.app` online in **prelaunch**: the whole site is public, taking the crown is limited to admins with the test payment provider, and everything else (sign-in, profiles, emails, share cards, legal pages, admin) works as at launch. M10b adds the real payment provider and launches.

Placeholders: `<ref>` is the Supabase project ref (the subdomain of its API URL). Values in `code` are exact. Secrets are pasted straight from the source into the destination; never into chat, tickets or the repo.

## 0. Before you start

- Accounts: Cloudflare (owns the domain), Vercel, Supabase, Resend, Google Cloud, X developer, Anthropic.
- Locally: `pnpm install`, Supabase CLI, and the repo on `main` with every migration merged.
- Generate the app's own secrets once and keep the output open until step 5 (then close it): `pnpm secrets:generate`. It prints `PAYMENT_WEBHOOK_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`, `EMAIL_LINK_SECRET` and `CLOUDFLARE_ORIGIN_SECRET`.

## 1. Cloudflare: base settings, email, Turnstile

1. **SSL/TLS → Overview:** encryption mode `Full (strict)`.
2. **SSL/TLS → Edge Certificates:** Always Use HTTPS `on`, Minimum TLS `1.2`, Automatic HTTPS Rewrites `on`. Leave HSTS off here: the app sends it.
3. **Speed → Optimization:** Rocket Loader `off`. It rewrites scripts and breaks the CSP nonces.
4. **Scrape Shield:** Email Address Obfuscation `off`. It injects a script without the nonce into pages that show an email (FAQ, terms, privacy). Hotlink Protection `off`, because emails load images from the site.
5. **Security → Bots:** Bot Fight Mode `off`. It challenges Vercel's cron calls and, later, payment webhooks, and the Free plan cannot exempt paths. Turnstile, the WAF and the app's limits cover bots.
6. **Email → Email Routing:** enable it. Add your inbox as a destination and verify it. Create the custom address `hola@takethecrown.app` → your inbox. Cloudflare adds the root MX and SPF records itself.
7. **Turnstile → Add widget:** name `Take the Crown`, hostnames `takethecrown.app` and `www.takethecrown.app`, mode `Managed`, pre-clearance `no`. Keep the **site key** and **secret key** for step 5.

## 2. Resend: sending domain

1. **Domains → Add domain:** `takethecrown.app`, region `us-east-1`.
2. Add every record Resend shows (MX and TXT on `send`, the DKIM TXT `resend._domainkey`) in Cloudflare DNS as **DNS only** (grey cloud). Then **Verify**.
3. In Cloudflare DNS add TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:hola@takethecrown.app`. Move to `p=quarantine` after a few weeks of clean reports.
4. **API Keys:** create `vercel-production` (Sending access, domain `takethecrown.app`) for step 5, and `supabase-smtp` (Sending access, same domain) for step 3.

## 3. Supabase: production project

1. **New project:** name `take-the-crown`, region `East US (North Virginia)` (next to Vercel's `iad1`). Use a generated database password and keep it in your password manager.
2. **Database → Extensions:** enable `pg_cron` (migration `0002` expects it).
3. **Link and push the migrations** from the repo (the CLI asks for the database password):

   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase db push
   ```

   Never pass `--include-seed`: `supabase/seed.sql` is local only. `supabase migration list` must show every migration (`0001` … `0020`) as applied remotely.
4. **Integrations → Cron:** four active jobs: `rollover-season`, `live-achievements`, `price-alerts` (every minute) and `purge-expired-records` (daily 03:17 UTC).
5. **Storage:** the public `avatars` bucket exists (1 MB, PNG and WebP), from migration `0011`.
6. **Authentication → URL Configuration:** Site URL `https://takethecrown.app`. Redirect URLs: `https://takethecrown.app/**`.
7. **Authentication → Sign In / Providers → Email:** enabled. Email OTP expiration `900` seconds. "Confirm email" may stay on: both templates below carry the same sign-in link.
8. **Authentication → Emails → SMTP Settings:** enable custom SMTP.
   - Host `smtp.resend.com`, port `465`, username `resend`, password = the `supabase-smtp` key from Resend.
   - Sender email `auth@takethecrown.app`, sender name `Take the Crown`.
9. **Authentication → Rate Limits:** emails sent per hour `100`. The app adds its own per-IP and per-email limits.
10. **Authentication → Emails → Templates:** for both **Magic Link** and **Confirm signup**:
    - Subject: `Your sign-in link · Tu enlace para entrar`
    - Body: the whole of `supabase/templates/sign-in.html`.
11. **Project Settings → API Keys:** keep the project URL `https://<ref>.supabase.co`, the publishable (anon) key and the secret (service role) key for step 5.
12. **Backups:** the Free plan has none. Pro keeps daily backups for 7 days; add Point-in-Time Recovery when real payments start (see the plans table).

## 4. Google and X sign-in

### Google Cloud

1. New project `Take the Crown`.
2. **Google Auth Platform → Branding:**
   - App name `Take the Crown`; user support and developer contact `hola@takethecrown.app`.
   - Home page `https://takethecrown.app/en`, privacy policy `https://takethecrown.app/en/privacy`, terms `https://takethecrown.app/en/terms`.
   - Authorized domains: `takethecrown.app` and `<ref>.supabase.co`.
   - No logo: a logo triggers brand verification.
3. **Audience:** External, then **Publish app** (In production). Scopes: `openid`, `email` and `profile`. They are non-sensitive, so no verification is needed.
4. **Clients → Create client:** Web application, name `Supabase production`. Authorized JavaScript origin `https://takethecrown.app`. Authorized redirect URI `https://<ref>.supabase.co/auth/v1/callback`.
5. In **Supabase → Authentication → Providers → Google**, enable it with that client ID and secret.

### X

1. In **developer.x.com**, on the Free tier, create a project and an app named `Take the Crown`.
2. **User authentication settings:**
   - OAuth 2.0 `on`, permissions `Read`, "Request email from users" `on`, type `Web App`.
   - Callback URI `https://<ref>.supabase.co/auth/v1/callback`, website `https://takethecrown.app`.
   - Terms `https://takethecrown.app/en/terms`, privacy `https://takethecrown.app/en/privacy`.
3. Copy the **OAuth 2.0** Client ID and Secret into **Supabase → Authentication → Providers → X / Twitter (OAuth 2.0)**.

## 5. Vercel: project, variables, domain

1. **Add New → Project:** import `dxsarango/take-the-crown`. Framework Next.js, root `./`, default build and install commands (pnpm), Node.js `24.x`.
2. **Plan:** Pro. The two crons run every minute, and Hobby is non-commercial with daily crons only.
3. **Settings → Environment Variables**, scoped to **Production** only. Preview deployments get no secrets until M10b's staging; the app refuses its test stand-ins on any deployment anyway.

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL` | `https://takethecrown.app` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable (anon) key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret (service role) key |
   | `PAYMENT_PROVIDER` | `test` (until M10b; it only works while prelaunch is on) |
   | `PAYMENT_WEBHOOK_SECRET` | from `pnpm secrets:generate` |
   | `IP_HASH_SALT` | from `pnpm secrets:generate` (never change it) |
   | `CRON_SECRET` | from `pnpm secrets:generate` |
   | `EMAIL_LINK_SECRET` | from `pnpm secrets:generate` (changing it breaks "turn off alerts" links already sent) |
   | `CLOUDFLARE_ORIGIN_SECRET` | from `pnpm secrets:generate` (same value as the Cloudflare rule in step 6) |
   | `EMAIL_PROVIDER` | `resend` |
   | `RESEND_API_KEY` | the `vercel-production` key from Resend |
   | `EMAIL_FROM` | `Take the Crown <alerts@takethecrown.app>` |
   | `MODERATION_PROVIDER` | `anthropic` |
   | `ANTHROPIC_API_KEY` | production key from the take-the-crown workspace (without credits, messages and links wait in review) |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key |
   | `TURNSTILE_SECRET_KEY` | Turnstile secret key |

4. **Settings → Domains:** add `takethecrown.app` and `www.takethecrown.app`, with `www` redirecting (308) to the apex. Create the DNS records Vercel shows in Cloudflare as **DNS only** (usually A `@` `76.76.21.21` and CNAME `www` `cname.vercel-dns.com`). Wait until both show "Valid Configuration" with a certificate.
5. **Deployments:** redeploy production after the variables are set. `NEXT_PUBLIC_*` values are built into the pages.
6. **Settings → Cron Jobs:** `/api/cron/moderation` and `/api/cron/notifications`, every minute.
7. **Settings → Billing → Spend Management:** set a spend amount with notifications (for example, $50 a month).
8. **Settings → Deployment Protection:** production is public. Keep Vercel Authentication for previews.

## 6. Cloudflare: proxy and rules

1. **DNS:** switch the apex A and `www` CNAME records to **Proxied** (orange cloud).
2. **Rules → Transform Rules → Modify Request Header:**
   - Name `origin secret`, when `All incoming requests`.
   - **Set static** header `x-origin-secret` = the `CLOUDFLARE_ORIGIN_SECRET` value.
3. **Security → WAF → Rate limiting rules** (the Free plan allows one rule, with a 10-second period):
   - Name `write APIs`.
   - Expression: `(http.request.uri.path in {"/api/locks" "/api/auth/magic-link" "/api/reports" "/api/profile" "/api/profile/avatar"} and http.request.method ne "GET")`.
   - Counted by IP, `20` requests per `10 seconds`, action **Block** for `10 seconds`.
   - The app enforces the hourly limits; `/api/names/availability` is covered by this rule on Pro (`120` per minute) and by the app's validation meanwhile.
4. **Caching:** no "Cache Everything" rule. HTML carries a per-request CSP nonce and must not be cached; static assets cache by default.
5. **Security → WAF → Managed rules:** the Cloudflare Free Managed Ruleset is on by default.

## 7. Check, sign in, configure

1. From the repo: `pnpm check:deploy https://takethecrown.app`. No FAIL lines. Expected WARNs right now: the legal placeholders not filled in yet (next step).
2. Sign in on the site with your own email, then make yourself admin in **Supabase → SQL Editor** (one-off):

   ```sql
   update profile_private set is_admin = true where email = '<your email>';
   ```

3. **`/en/admin` → Config → Legal pages:**
   - Contact `hola@takethecrown.app`, city, payment provider (until the provider answers, the name you will use), effective date.
   - Run `pnpm check:deploy https://takethecrown.app` again: no placeholders left.
4. **Test the flow** as admin: take the crown with the test checkout, get dethroned from a second admin account (dethroned email arrives), share cards, turn off an alert from the email, delete a test account. All of this is wiped at launch.
5. **Anthropic** (before launch): add credits, run `pnpm test:moderation` against the real model (all cases pass), set a monthly spend limit and auto-reload with a low threshold.

## Launch (M10b)

`/admin` → Launch. Pick the start, check the resulting season dates (Genesis lasts at least `app_config.min_first_season_days`, 14 by default, and later seasons move with it), then confirm. It only works with the real payment provider. It deletes every prelaunch test reign, payment and achievement, and opens the crown to everyone.

## Plans: prelaunch vs launch

| Service | Prelaunch | Before launch |
|---|---|---|
| Vercel | **Pro** from the start: per-minute crons, and Hobby forbids commercial use | Pro; set spend management |
| Supabase | Free works (500 MB database, 1 GB storage, 50k monthly users), but it pauses after a week without traffic and has **no backups**; Pro if the provider's review may take weeks | **Pro** (no pausing, daily backups for 7 days); PITR add-on once real money flows |
| Cloudflare | Free: proxy, SSL, Free Managed Ruleset, one rate-limit rule, Transform Rules, Email Routing, Turnstile | Pro recommended for the full managed WAF ruleset and more rate-limit rules (names availability, per-route thresholds) |
| Resend | Free: 3,000 emails a month, **100 a day**, one domain | **Pro**: dethroned alerts plus sign-in links will pass 100 a day |
| Anthropic | No credits needed: moderation is unavailable, so messages and links wait for admin review | Credits, auto-reload, monthly spend limit, `pnpm test:moderation` passing |
| Google, X | Free (non-sensitive scopes; X Free tier covers sign-in) | Same |

## Seasons after Frost

Genesis (season 0) runs until 2026-12-01 (or 14 days from a later launch), Frost (season 1) through December 2026, and Day of the Dead (season 2) in November 2027. Seasons for January to October 2027 must be added before Frost ends: when a season ends, the crown moves to the next season id, and with no season running until November 2027 nobody could take it.
