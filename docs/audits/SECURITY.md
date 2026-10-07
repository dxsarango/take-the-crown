# Security audit

Goal: users and payments are protected against the real attack paths for this stack (Next.js App Router on Vercel behind Cloudflare, Supabase, Dodo Payments, Anthropic moderation). Organized by the OWASP Top 10:2025 categories. Each item must end as **verified** (with a test or evidence) or **fixed** (with a test), never assumed.

Output: `docs/audits/SECURITY-REPORT.md` with every item, its status, evidence and the PR that fixed it. Findings by severity; fix critical, high and medium; list low for the owner.

## A01 Broken access control

- **Authorization lives in the data layer, not in middleware/proxy.** Next.js has had repeated middleware/proxy bypass advisories in 2026 (crafted `.rsc`/segment-prefetch URLs, i18n data routes, Turbopack with a single locale). Every page, route handler and server action that reads or writes protected data must check the session and role itself. The proxy may redirect for UX only.
- **Server actions are public HTTP endpoints.** Enumerate every `"use server"` function. Each one validates input with zod and checks authentication, ownership and admin role (plus recent sign-in and MFA for sensitive admin actions) inside the function. Write a test per action that calls it without a session, with another user's session and with a non-admin session.
- **IDOR:** every endpoint that takes an id (profile, reign, payment, lock, report, achievement) checks ownership or admin. Try another user's ids in tests.
- **Header trust:** the app must never trust client-supplied identity or routing headers. Test requests with forged `x-middleware-subrequest`, `x-forwarded-for`, `x-real-ip`, `x-forwarded-host`, `x-forwarded-proto`, `host`, `cf-connecting-ip`, `cf-ipcountry`, `x-origin-secret` (wrong value), `x-user-id` and similar. Only the Cloudflare headers with a valid origin secret may influence IP and country.
- **Absolute URLs** (magic links, OAuth redirects, emails, share cards, sitemap) are built from `NEXT_PUBLIC_SITE_URL`, never from the request host.
- **Open redirects:** every `next`/`redirect`/`returnTo` parameter only accepts same-origin relative paths (already fixed once; keep the tests and extend to every redirect).
- **Supabase RLS:** keep the RLS and anon allowlist checks in `check:deploy`. Verify that no client can call security definer functions, write to any table, read `profile_private`, `payments`, `price_locks`, `notifications` or reports, or read hidden messages through any view.
- **Storage:** the `avatars` bucket allows public read of processed files only; uploads only through the server; no listing; file type checked by content, not extension.
- **Realtime:** only public tables are published; payloads contain no private fields.

## A02 Security misconfiguration

- Supabase **Security Advisor** and **Performance Advisor** run on production with zero errors; warnings reviewed and documented.
- Supabase Auth: redirect URL allowlist contains only exact production and local URLs (no broad wildcards); site URL is production; email templates use the production domain; auth rate limits reviewed.
- Cloudflare: SSL Full (strict), Always Use HTTPS, minimum TLS 1.2, HSTS consistent with the app header, DNSSEC enabled, registrar lock on the domain.
- Security headers stay as `check:deploy` verifies; add `Cross-Origin-Opener-Policy: same-origin` and review `Cross-Origin-Resource-Policy` where it does not break embeds.
- No stack traces or internal errors in responses; generic error pages in production.
- `robots.txt` disallows `/admin`, `/api`, `/settings`; those routes also send `noindex`.
- Add `/.well-known/security.txt` with the contact address and an expiry date.
- The `*.vercel.app` production URL: decide whether to block it (redirect to the domain) so traffic cannot skip Cloudflare.

## A03 Software supply chain failures

- Next.js and React on versions with no open advisories; record the versions checked and the advisories reviewed (Next middleware/proxy bypass CVEs of 2026, React Server Components advisories).
- `pnpm audit` clean or each finding justified. Enable Dependabot or Renovate for security updates.
- pnpm: lockfile committed and frozen in CI; consider `minimumReleaseAge` to avoid installing packages published minutes ago; review install scripts of dependencies.
- GitHub: secret scanning and push protection on; branch protection on `main` if the plan allows; Actions pinned by commit SHA when added.
- The patched Next file (pnpm patch) is reviewed on every Next upgrade.

## A04 Cryptographic failures

- No secrets in the client bundle (already checked by `check:deploy`); keep that check.
- IP hashes use a secret salt; consider rotating the salt yearly (old hashes simply stop matching).
- Signed unsubscribe links and any other signed token use HMAC with constant-time comparison and expiry.
- Cookies: `Secure`, `HttpOnly` where possible, `SameSite=Lax` or stricter, no sensitive data in non-HttpOnly cookies.

## A05 Injection

- SQL: only parameterized queries and RPC; no string-built SQL anywhere, including admin search.
- XSS: no `dangerouslySetInnerHTML` with user data; user text rendered as text everywhere (pages, share cards, emails, admin). Test names and messages with HTML, SVG, `javascript:` URLs and Unicode tricks (bidi overrides, zero-width characters, homoglyphs of "admin" and the brand).
- Links: only `https:`; rendered with `rel="sponsored ugc noopener"`.
- Emails: user text escaped in templates and subject lines (no header injection).
- Share cards (`next/og`): user text cannot break the template or load remote resources.
- LLM prompt injection: keep the rules layer before the model, the escaping and the live suite (OWASP LLM Top 10 lists prompt injection as the top risk for LLM apps).

## A06 Insecure design

- Price integrity: amount always from the lock; currency and amount re-checked in `apply_payment`; webhook signature, replay window and idempotency (already in place, keep the tests).
- Abuse cases with tests: lock griefing, mass magic-link requests, report flooding, name squatting, avatar upload abuse, card testing (many small payments from one IP or email), self-dealing between two accounts to farm achievements.
- Emergency pause switch (in progress) and runbook in `docs/INCIDENTS.md`: what to do if payments, moderation, auth or the database fail during the launch.

## A07 Authentication failures

- No passwords exist: sign-in is magic link, Google and X. Confirm there is no password sign-in enabled in Supabase.
- Admin: MFA (TOTP) required, recent sign-in for sensitive actions, sessions limited (in progress). No default, shared or test admin accounts in production; the admin list is reviewed before launch.
- Magic links: single use, short expiry, rate limited per email and per IP, uniform responses that do not reveal whether an email has an account.
- Session revocation on account deletion, suspension and sign-out everywhere.
- OAuth: `state`/PKCE handled by Supabase; callback URLs exact.

## A08 Software or data integrity failures

- Webhooks: signature verified on the raw body before parsing; timestamp window; unknown event types ignored safely.
- Migrations only through the reviewed migration files; production changes only via `supabase db push`; no manual schema edits in the dashboard.
- Cron routes require `CRON_SECRET` with constant-time comparison.

## A09 Security logging and alerting failures

- Error monitoring (in progress) with alerts for webhook, payment, moderation, auth and cron errors.
- Admin audit log covers every admin action with actor, time and target (exists; verify completeness).
- Alerts for: refunds stuck, disputes opened, moderation unavailable, repeated failed admin access, spikes of rate-limit blocks.
- Logs never contain emails, tokens, full IPs or secrets.

## A10 Mishandling of exceptional conditions

- Every external call (Dodo, Anthropic, Resend, Supabase) has a timeout, a defined failure behavior that fails closed for money and access, and a test.
- Partial failures cannot crown without payment or charge without crowning (refund path covers it).
- Error boundaries in the UI; no blank pages on errors.

## External checks after fixes

- Mozilla HTTP Observatory, securityheaders.com and SSL Labs: record the grades.
- OWASP ZAP baseline scan against production in prelaunch.
- Owner checklist (accounts outside the code): 2FA with an authenticator app on GitHub, Vercel, Supabase, Cloudflare, Dodo, Resend, Anthropic, Google Cloud, X developer and the domain registrar; recovery codes stored; no shared passwords; secrets only in Vercel and `.env.local`.

## References

- OWASP Top 10:2025: https://owasp.org/Top10/2025/0x00_2025-Introduction/
- Next.js security advisories: https://github.com/vercel/next.js/security/advisories
- Supabase security checklists and advisors: https://supabase.com/docs/guides/database/database-advisors
