# Take the Crown

Pay-to-take-the-crown web game. One crown, rising price with decay, glory measured in time reigned. Full spec: `docs/SPEC.md`.

## Sources of truth

- Game logic and data: `supabase/migrations`. Never duplicate takeover, pricing or achievement logic in TypeScript; call the SQL functions.
- UI: the design handoff in `/design`. Match it exactly. Exclude the review-only season selector and `review-audit.js`.
- Build order: `docs/SPEC.md` §17. Work one milestone at a time.
- Future ideas and their constraints: docs/IDEAS.md. Never build them without an explicit milestone.

## Stack

Next.js App Router, TypeScript strict, Tailwind, Supabase (Postgres, Auth, Realtime, Storage, pg_cron), next-intl, Resend, next/og, sharp, Vitest, Playwright, pnpm.

Next is patched (`patches/next@*.patch`, pnpm `patchedDependencies`): review the patch on every Next upgrade and drop it once Next fixes the bug (docs/PROGRESS.md, decision 47).

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
- Never print, echo, log or display secret values from .env files or environment variables, including partially. To check a variable, test whether it is set or print its length.

## Commands

- `pnpm dev` — app
- `pnpm test` — unit and database tests
- `pnpm e2e` — Playwright with the `test` payment provider
- `supabase start` / `supabase db reset` — local database

## Working rules

- Reply to me in Spanish. Code, identifiers, comments, commits and docs stay in English.
- Before writing code for a milestone, read the parts of `docs/SPEC.md`, `supabase/migrations` and `/design` that it touches, including files the milestone does not mention by name, and use what you find.
- Track milestone tasks in `docs/PROGRESS.md` as a checklist. Update it as you go.
- Start each milestone with one line stating what you are about to do.
- Finish the whole milestone before reporting. Do not end a turn with a summary that announces the next step instead of doing it, with an offer to continue that waits for my answer, or with a list of decisions when none of them blocks the rest of the work. Put recommendations on open decisions in your final report and keep working on everything that does not depend on them.
- Stop and ask only when nothing can move without me: credentials, external accounts, paid services, or a decision that changes the spec. Always ask before destructive actions (deleting data, force pushes, dropping tables, rewriting applied migrations).
- Run tests yourself. A milestone is done when its checklist is complete, tests pass, and lint and typecheck are clean.
- Final report per milestone: what was built, what was tested, what needs my decision. A few lines, no long explanations.

## UI rules

- Match `/design` exactly: tokens, spacing, typography, pixel art rules, states and motion specs.
- Where the design does not cover something, extend its system. Do not fall back to generic defaults: no cream or off-white backgrounds, no italic accent words in headlines, no numbered "01/02/03" section labels, no monospace labels, no pill-shaped buttons, no generic gray card shadows.
- Pixel art always renders at integer scale with `image-rendering: pixelated`.
- Verify UI work by taking Playwright screenshots on mobile (390 px) and desktop (1440 px) and comparing them with the design screens.

## Git workflow

- `main` is the default branch and always passes lint, typecheck and tests. Never commit directly to `main` and never force push it.
- Conventional Commits for every commit: `type(scope): subject`. Types: feat, fix, refactor, perf, test, docs, style, build, ci, chore, revert. Scopes: db, api, ui, auth, payments, game, i18n, admin, email, og, design, deps, config.
- Subject in imperative mood, lowercase, no trailing period, max 72 characters. Add a body only when the why is not obvious. Use `BREAKING CHANGE:` in the footer when applicable.
- Small, atomic commits that each build and pass tests. Do not mix unrelated changes. Never commit secrets or `.env` files.
- Tag releases on `main` with semantic versions, starting at `v0.1.0` for launch.
- Commit messages, commit trailers, PR titles and descriptions, and branch names must not mention or suggest AI assistance or any AI tool. No `Co-Authored-By` trailers, no "Generated with" lines, no session links, no signatures. The history must read like any developer's normal work.
- Never stack PRs. Every PR targets main (base = main). If work depends on an unmerged PR, wait for it to merge, then branch from the updated main.
- Before reporting a PR as ready, verify its base with `gh pr view <n> --json baseRefName`.
- After any merge, verify the commits are on main with `git log origin/main`. A merge is not done until main has it.

## Branching and PRs

- One task = one branch = one PR. Branch from an up-to-date `main` (`git fetch && git switch -c <type>/<name> origin/main`). Names are `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`, `docs/<short-name>`, lowercase and hyphen-separated, describing the change.
- Work sequentially. Do not start a new branch until the previous PR is merged, unless the new work touches completely different files.
- Never run parallel subagents or worktrees that edit overlapping files. Parallel work is allowed only when the file sets are disjoint and stated up front.
- Keep PRs small and short-lived: merge the same day if possible. Split large features into sequential PRs (data layer → API → UI), each mergeable on its own.
- Merge through a pull request with a conventional title and a short description of what changed and how it was tested. Keep history linear (rebase before merging).
- If a later PR depends on an unmerged one, stack it (branch from the previous branch) and say so in the PR description. After the base merges, rebase onto `main`.
- Shared files (next.config, middleware, headers config, package.json, lockfile, shared utils, Supabase migrations) change in one place only. Fix shared helpers once; never patch the same issue separately in several branches.
- Shared docs (`docs/PROGRESS.md`, `docs/SPEC.md`, `docs/DEPLOY.md`): when a task produces several PRs, keep them out of the feature PRs when possible and record those updates in the last PR of the series.
- Migrations: only one open PR with new migrations at a time, numbered after the latest on `main` (renumber if `main` moved). Never merge a PR with a migration until the owner confirms it has been pushed to production.
- Dependency changes go in their own commit; run `pnpm install` once.
- Before opening or updating a PR: `git fetch && git rebase origin/main`, then lint, typecheck and unit tests.
- After a PR is merged, rebase every other open PR on the updated `main` and resolve conflicts. If only docs conflicted, run typecheck and lint; otherwise run typecheck, lint and the full unit and database suites, plus the e2e specs for the areas the PR touches. Push with `--force-with-lease` and wait for the GitHub checks. Never force push `main`.
- When given several tasks at once, first list the files each task touches. If any overlap, do them in series.
- Audits (`SECURITY.md`, `PERFORMANCE.md`, `SEO.md`): Phase 1 writes findings to `docs/audits/<name>-findings.md` without code changes; Phase 2 implements on one branch `audit/<name>`, one commit per finding, one PR.
- Dependabot: do not merge major updates before launch (Oct 27) without asking.
- In every final report, list the open PRs in the order they should be merged.
