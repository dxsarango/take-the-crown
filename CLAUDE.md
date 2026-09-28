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

## Working rules

- Reply to me in Spanish. Code, identifiers, comments, commits and docs stay in English.
- Before writing code for a milestone, read the parts of `docs/SPEC.md`, `supabase/migrations` and `/design` that it touches, including files the milestone does not mention by name, and use what you find.
- Track milestone tasks in `docs/PROGRESS.md` as a checklist. Update it as you go.
- Start each milestone with one line stating what you are about to do.
- Finish the whole milestone before reporting. Do not end a turn with a summary that announces the next step instead of doing it, with an offer to continue that waits for my answer, or with a list of decisions when none of them blocks the rest of the work. Put recommendations on open decisions in your final report and keep working on everything that does not depend on them.
- Stop and ask only when nothing can move without me: credentials, external accounts, paid services, or a decision that changes the spec. Always ask before destructive actions (deleting data, force pushes, dropping tables, rewriting applied migrations).
- A milestone is done when its checklist is complete, tests pass, and lint and typecheck are clean.
- Final report per milestone: what was built, what was tested, what needs my decision. A few lines, no long explanations.

## UI rules

- Match `/design` exactly: tokens, spacing, typography, pixel art rules, states and motion specs.
- Where the design does not cover something, extend its system. Do not fall back to generic defaults: no cream or off-white backgrounds, no italic accent words in headlines, no numbered "01/02/03" section labels, no monospace labels, no pill-shaped buttons, no generic gray card shadows.
- Pixel art always renders at integer scale with `image-rendering: pixelated`.
- Verify UI work by taking Playwright screenshots on mobile (390 px) and desktop (1440 px) and comparing them with the design screens.