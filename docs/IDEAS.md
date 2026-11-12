# Ideas

Post-launch backlog. Nothing here is scheduled. Each idea needs a spec update and new migrations before it is built.

## Constraints for every idea

- **Payment provider policy.** The merchant of record restricts in-game currencies, sale of digital items and online game environments. Our approval is based on a disclosed model: a paid featured placement with earned, non-purchasable progression. Any idea that changes what is sold, or makes the product materially more game-like, must be disclosed to the provider before launch of that feature.
- **Nothing is sold except the crown.** Cosmetics, ranks, achievements and unlocks are earned, never purchased, never tradable, and have no monetary value.
- **Never:** prediction or betting mechanics (even with virtual points), loot boxes or chance-based rewards, trading between players, groups pooling money to buy the crown, dislike or downvote buttons.

## Phase 1: after launch

### TikTok-first landing
Decided 2026-11-11: the game got no traction from a cold launch, but the TikTok account gets about 500 views per video. Improve the site for that audience before posting more content. TikTok links are plain text (no clickable link, and a business account needs a company), so visitors type the address.

Step 1, landing and attribution (one PR):
- Home above the fold understood in 5 seconds: the king (avatar, name), live reign counter, current takeover price from the SQL pricing function, one call to action, and a live feed of recent takeovers. Viewable without signing up; mobile first and light, for TikTok's in-app browser.
- One short route per video (`/7`, `/8`, …) that serves the home page. Vercel Web Analytics (already live, path kept) reports visits per route: no custom table, no new dependency. Check the routes do not collide with profile or season paths.

Step 2, free entry for spectators: "Hail the king" below. Decided 2026-11-12: visitors may hail without an account (Turnstile, an hourly limit per address, one hail per browser and reign, a few per address and reign). Boo or dislike reactions are not an option (see Never).

How we judge it: visits per video route, hails and new accounts, payments. Traffic without payments points at the offer; no traffic points at distribution.

### Sign out of all devices
A button in edit profile that ends every session of the account (`signOut({ scope: "global" })`). Today sign-out ends only the current device. Build it if players ask. From the security audit (L6).

### Hail the king
A single reaction for the current king: "Long live the king!" / "¡Viva el rey!", with a pixel crown or banner icon.

- Built (docs/PROGRESS.md, milestone 12): the button and live counter on the throne, hails stored per reign, open to visitors without an account (one per browser or account and reign, Turnstile, address limits). Signed-in players hail under their account. A king cannot hail themselves.
- Not built yet: the rest of this list. Hails from accounts are the ones that count for it; hails without an account only feed the throne counter.
- Aggregated per season and all time.
- Profile shows total hails received (all time, never resets).
- New hall of fame category per season: People's King / Rey del pueblo (most hails in the season).
- Achievements: Beloved / Amado (100 hails in one reign), People's King / Rey del pueblo (most hails in a season), Loyal subject / Súbdito leal (hailed 50 different kings).

### Follow kings
Follow a player and get an alert when they take or lose the crown. Opt-in, uses the existing notification outbox and unsubscribe flow.

### Profile customization unlocked by progress
Steam-style profile customization, unlocked by achievements, ranks and seasons, never purchased:

- Profile backgrounds (seasonal ones only obtainable during their season).
- Frame animations (for example, for Guardian III).
- Extra showcase slots by rank.
- Exclusive background for each King of the Season.

## Phase 2

### Pet
A pixel pet that starts as an egg and evolves with total reign time: hatches after the first hour on the throne, evolves at Knight, Baron, Count, Duke and Emperor. Seasonal variants depend on the season the egg hatched in and never return. Shown on the profile and optionally next to the king on the throne.

### Season events
Announced, time-boxed modifiers inside a season, such as a double-decay hour or a weekend with a lower price increase. Configured from the admin, shown in advance on the home and in the feed.

### Country war
A season event where countries compete by total reign time. The winning country gets a banner on the home during the following month. Builds on the existing country leaderboard.

### Weekly chronicle
Auto-generated weekly summary of notable reigns, rivalries and records, with a share card, ready to post on social media.

## Discarded

### Internal currency
Discarded on 2026-10-03. An internal currency, even earned-only, would make the product look like an online game environment and conflicts with the payment provider's restrictions on in-game currencies and digital item sales. The goals behind it (cosmetics, customization, reasons to come back) are covered by progress-based unlocks in phase 1. Revisit only with a payment provider that explicitly supports it and after a fresh compliance review.
