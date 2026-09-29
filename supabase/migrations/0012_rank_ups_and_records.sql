-- Rank-ups (decision 19) and the aggregates behind the hall of fame and the season end page.

alter type event_kind add value if not exists 'rank_up';

-- ---------------------------------------------------------------------------
-- Rank-ups: one row, and one event, per profile per rank
-- ---------------------------------------------------------------------------

create table rank_ups (
  profile_id uuid not null references profiles (id) on delete cascade,
  rank text not null check (rank in ('knight', 'baron', 'count', 'duke', 'emperor')),
  reached_at timestamptz not null default now(),
  primary key (profile_id, rank)
);

alter table rank_ups enable row level security;
create policy public_read on rank_ups for select using (true);
grant select on rank_ups to anon, authenticated;

-- Records every rank the player's total reign time has reached and publishes a rank_up event for
-- each new one. Ranks skipped in one go (a long first reign) are all recorded; the primary key
-- keeps each one to a single event however often this runs.
create or replace function record_rank_ups(p_profile_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_total bigint;
  v_season int;
  v_count int;
begin
  select total_reign_seconds into v_total from profile_stats where profile_id = p_profile_id;
  if v_total is null then
    return 0;
  end if;
  select season_id into v_season from crown_state;

  with ladder (rank, min_seconds) as (
    values ('knight', 3600), ('baron', 21600), ('count', 86400), ('duke', 259200), ('emperor', 604800)
  ),
  reached as (
    insert into rank_ups (profile_id, rank)
    select p_profile_id, l.rank from ladder l where l.min_seconds <= v_total
    on conflict do nothing
    returning rank
  )
  insert into events (kind, season_id, profile_id, payload)
  select 'rank_up', v_season, p_profile_id, jsonb_build_object('rank', r.rank)
  from reached r
  join ladder l on l.rank = r.rank
  order by l.min_seconds;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function record_rank_ups(uuid) from public, anon, authenticated;

-- A reign that ends adds its time to the player's total.
create or replace function reigns_record_rank_ups()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform record_rank_ups(new.profile_id);
  return null;
end $$;

revoke execute on function reigns_record_rank_ups() from public, anon, authenticated;

create trigger reigns_rank_ups
after update of ended_at on reigns
for each row
when (old.ended_at is null and new.ended_at is not null)
execute function reigns_record_rank_ups();

-- Same as 0001, plus the reigning king's rank-ups (the king's total grows every minute).
create or replace function check_live_achievements()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_reign reigns;
begin
  select r.* into v_reign from reigns r join crown_state s on s.current_reign_id = r.id;
  if v_reign.id is not null then
    perform award_guardian(v_reign.profile_id, extract(epoch from (now() - v_reign.started_at))::bigint, v_reign.id);
    perform record_rank_ups(v_reign.profile_id);
  end if;
end $$;

-- Ranks already reached before this migration are recorded without events.
insert into rank_ups (profile_id, rank)
select s.profile_id, l.rank
from profile_stats s
join (values ('knight', 3600), ('baron', 21600), ('count', 86400), ('duke', 259200), ('emperor', 604800))
  as l (rank, min_seconds) on l.min_seconds <= s.total_reign_seconds
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Records
-- ---------------------------------------------------------------------------

-- Same columns as 0001 plus how many players reigned for each country.
create or replace view country_leaderboard as
select
  season_id,
  country_code,
  count(*)::int as crowns,
  sum(coalesce(duration_seconds, extract(epoch from (now() - started_at))::int))::bigint as reign_seconds,
  count(distinct profile_id)::int as kings
from reigns
where country_code is not null
group by season_id, country_code;

-- A season in numbers (season end page, kingdom history).
create view season_stats as
select
  season_id,
  count(*)::int as reigns,
  count(distinct profile_id)::int as kings,
  count(distinct country_code)::int as countries,
  max(coalesce(duration_seconds, extract(epoch from (now() - started_at))::int))::int as longest_seconds,
  min(duration_seconds)::int as shortest_seconds,
  max(price_paid_cents)::int as peak_price_cents
from reigns
group by season_id;

grant select on season_stats to anon, authenticated;
