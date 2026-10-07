# Incidents

What to do when something fails around the launch. Start with the pause when money or content is at risk; everything else waits for it.

## The pause

- `/admin` → Throne → **Pause takeovers** (needs a sign-in from the last 10 minutes). Nobody, admins included, can lock the crown; the site stays up and readable; a payment for a lock taken before the pause still settles (it crowns, or it is refunded). **Resume takeovers** reopens.
- If `/admin` is unreachable: Supabase → SQL Editor, `update app_config set paused = true;` (and `false` to resume).
- Pausing does not stop crons: alerts, refunds and moderation retries keep running.

## Payments (Dodo)

- **Signs:** checkouts fail to open (`checkout failed` in the Vercel logs), webhooks fail in Dodo's dashboard, buyers report paying without the crown.
- **Act:** pause. Check Dodo's status page and the webhook endpoint's delivery log. Failed webhooks are retried by Dodo; once our endpoint answers 200 they settle in order (late ones inside the grace window crown, later ones are refunded).
- **A buyer paid and was not crowned:** `/admin` → Payments shows the payment and its status. `refund_pending` retries on its own (Refunds section); `applied` without a reign means a later payment took the crown first and this one was refunded.
- **Disputes:** every admin gets an email when one opens; answer it in Dodo's dashboard before its deadline.

## Moderation (Anthropic)

- **Signs:** `moderation unavailable` in the logs; messages and links wait in `/admin` → In review.
- **Act:** nothing is published unchecked: takeovers go ahead with message and link held, and the cron retries every minute. Check Anthropic's status page and the account's credits and spend limit. Review held items by hand if it lasts.

## Sign-in and email (Supabase Auth, Resend)

- **Signs:** players report no sign-in email; `magic link failed` or `OAuth provider ... unavailable` in the logs.
- **Act:** check Resend's dashboard (domain verified, daily quota) and Supabase → Authentication → Logs. Google and X keep working if email fails, and the other way round.

## Database (Supabase)

- **Signs:** `/api/health` answers 503 (the uptime monitor alerts), pages show the error screen.
- **Act:** check Supabase's status page and the project's dashboard (paused project, disk, connections). Nothing to do in the app: it recovers by itself when the database answers. Do not run manual schema changes; migrations only through `supabase db push`.

## A leaked secret or a compromised account

- **Secrets:** rotate in the service first (Supabase service role key, Dodo API key and webhook secret, Resend key, Anthropic key, `CRON_SECRET`, `EMAIL_LINK_SECRET`, `CLOUDFLARE_ORIGIN_SECRET`), then update it in Vercel and redeploy. Rotating `EMAIL_LINK_SECRET` breaks the turn-off links in emails already sent; rotating `IP_HASH_SALT` resets rate limits and report de-duplication.
- **An admin account:** remove `is_admin` in SQL (`update profile_private set is_admin = false where email = '...';`), delete its sessions and factors (`delete from auth.sessions where user_id = ...; delete from auth.mfa_factors where user_id = ...;`), and review `/admin` → Log for what it did.
- **A player's account:** suspend it from `/admin` → Reports (Reversals lifts it) and end its sessions in SQL as above.

## Abuse

- **Floods** (sign-in links, reports, locks): the app limits them per IP and per address; Cloudflare's rate-limit rule covers the write APIs. For a sustained attack, add a Cloudflare WAF rule (block or challenge the source), and pause if takeovers are affected.

## Afterwards

Write what happened, what was affected and what changed in `docs/PROGRESS.md` (Decisions), and add a test for it when the cause was in the code.
