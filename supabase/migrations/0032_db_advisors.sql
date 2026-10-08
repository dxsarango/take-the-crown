-- Supabase advisors review: the public views are documented and pinned, one more per-reign leak
-- is closed, the foreign keys get indexes and two log tables get primary keys.

-- ---------------------------------------------------------------------------
-- Views: security definer is intentional
-- ---------------------------------------------------------------------------

-- The advisor flags every view that runs as its owner. Here that is the design: the base tables
-- are row-level-security locked with no policies, so clients cannot read them at all, and each
-- view is the one public read surface, exposing only the columns it lists. tests/db/views.test.ts
-- pins the exact column list of each, so a new column cannot become public by accident.

comment on view achievement_stats is
  'Public read surface: how many players hold each achievement. The base tables are RLS-locked with no policies; this view is the only way clients read them, and it must run as its owner (security definer).';
comment on view public_crown_state is
  'Public read surface: the crown state with the current price. The base tables are RLS-locked with no policies, so the active lock id and payments stay out of reach; the view must run as its owner (security definer).';
comment on view profile_stats is
  'Public read surface: per-profile totals and rank. total_spent_cents is null unless the player shows it. The base tables are RLS-locked with no policies; the view must run as its owner (security definer).';
comment on view season_leaderboard is
  'Public read surface: reigns per player and season, reversed reigns left out. The base tables are RLS-locked with no policies; the view must run as its owner (security definer).';
comment on view country_leaderboard is
  'Public read surface: reigns per country and season, reversed reigns left out. The base tables are RLS-locked with no policies; the view must run as its owner (security definer).';
comment on view public_chronicle is
  'Public read surface: each reign with the player it took the crown from and the one that took it next. The base tables are RLS-locked with no policies; the view must run as its owner (security definer).';
comment on view public_rivalries is
  'Public read surface: head-to-head crown takeovers between two players. The base tables are RLS-locked with no policies; the view must run as its owner (security definer).';
comment on view season_stats is
  'Public read surface: totals and records per season. The base tables are RLS-locked with no policies; the view must run as its owner (security definer).';
comment on view public_reigns is
  'Public read surface: reigns, with the message and link only once approved and the price only for players who show their total spent. The base tables are RLS-locked with no policies; the view must run as its owner (security definer).';

-- ---------------------------------------------------------------------------
-- public_reigns: the price follows show_total_spent
-- ---------------------------------------------------------------------------

-- profile_stats already hides the total for players who keep it private, but the per-reign prices
-- could be summed to get it back. Same columns, same order.
create or replace view public_reigns as
select
  r.id,
  r.season_id,
  r.profile_id,
  case when p.show_total_spent then r.price_paid_cents end as price_paid_cents,
  r.name,
  r.country_code,
  case when r.message_hidden or r.moderation_status <> 'approved' then null else r.message end as message,
  case when r.message_hidden or r.moderation_status <> 'approved' then null else r.link end as link,
  r.started_at,
  r.ended_at,
  r.end_reason,
  r.dethroned_by,
  r.duration_seconds,
  r.reversed_at is not null as reversed
from reigns r
left join profiles p on p.id = r.profile_id;

-- ---------------------------------------------------------------------------
-- public_chronicle: say which reigns were reversed
-- ---------------------------------------------------------------------------

create or replace view public_chronicle as
select
  r.id,
  r.season_id,
  r.profile_id,
  r.name,
  r.country_code,
  r.started_at,
  r.ended_at,
  r.end_reason,
  r.duration_seconds,
  f.profile_id as from_profile_id,
  f.name as from_name,
  f.country_code as from_country_code,
  n.profile_id as to_profile_id,
  n.name as to_name,
  n.country_code as to_country_code,
  r.reversed_at is not null as reversed
from reigns r
left join lateral (
  select p.profile_id, p.name, p.country_code
  from reigns p
  where p.id = (select max(q.id) from reigns q where q.id < r.id)
    and p.end_reason = 'dethroned' and p.dethroned_by = r.profile_id
) f on true
left join lateral (
  select x.profile_id, x.name, x.country_code
  from reigns x
  where r.end_reason = 'dethroned'
    and x.id = (select min(q.id) from reigns q where q.id > r.id)
) n on true;

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys
-- ---------------------------------------------------------------------------

-- Deleting or joining on these columns scanned the whole table. crown_state, achievements and
-- admin_actions stay as they are: a handful of rows each.
create index notifications_profile_idx on notifications (profile_id);
create index reigns_dethroned_by_idx on reigns (dethroned_by);
create index events_profile_idx on events (profile_id);
create index events_reign_idx on events (reign_id);
create index price_locks_profile_idx on price_locks (profile_id);
create index profile_achievements_code_idx on profile_achievements (achievement_code);
create index profile_achievements_reign_idx on profile_achievements (reign_id);

-- ---------------------------------------------------------------------------
-- Primary keys on the two log tables
-- ---------------------------------------------------------------------------

alter table rate_limit_hits add column id bigint generated always as identity primary key;
alter table profile_name_history add column id bigint generated always as identity primary key;
