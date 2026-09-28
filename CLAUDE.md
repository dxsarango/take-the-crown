# Take the Crown

Pay-to-take-the-crown web game. One crown, rising price with decay, glory measured in time reigned. Full spec: `docs/SPEC.md`.

## Sources of truth

- Game logic and data: `supabase/migrations`. Never duplicate takeover, pricing or achievement logic in TypeScript; call the SQL functions.
- UI: the Claude Design handoff in `/design`. Match it exactly. Exclude the review-only season selector and `review-audit.js`.
- Build order: `docs/SPEC.md` §17. Work one milestone at a time.

## Stack

Next.js App Router, TypeScript strict, Tailwind, Supabase (Postgres, Auth, Realtime, Storage, pg_cron), next-intl, Resend, next/og, sharp, Vitest, Playwright, pnpm.

## Conventions

- Everything in English: code, identifiers, comments, commits, docs.
- Comments only when the why is not obvious. No narration, no restating code.
- No `any`. Validate all external input with zod.
- Money in integer USD cents. Time from the database (`now()`), never trust client clocks.
- Config values come from `app_config`; never hardcode prices or durations.
- All writes go through server code with the service role. The browser only reads public tables and views.
- All UI strings in `messages/en.json` and `messages/es.json`. No hardcoded copy.
- Schema changes go in a new migration. Never edit an applied migration.
- Keep dependencies minimal; ask before adding a heavy one.
- Server-only secrets never reach client bundles.

## Commands

- `pnpm dev` — app
- `pnpm test` — unit and database tests
- `pnpm e2e` — Playwright with the `test` payment provider
- `supabase start` / `supabase db reset` — local database

## Testing

Run tests yourself before reporting a milestone done. Database and concurrency tests for the takeover flow are mandatory. Only ask for help when credentials or external accounts are required.

## Reporting

After each milestone: a few lines on what was built, what was tested, and anything that needs a decision. No long explanations.
