-- Performance audit: the hall of fame is computed in the database, and the remaining foreign keys
-- that grow with the game get indexes.

-- ---------------------------------------------------------------------------
-- Hall of fame
-- ---------------------------------------------------------------------------

-- The page used to read every row of season_leaderboard, country_leaderboard and public_reigns and
-- rank them in the server. That grows with the game, and PostgREST cuts an answer at max_rows
-- (1000), so past that the records would have been picked from an arbitrary part of the data.
-- This returns only the top rows of each tab, for one season or (null) for all time. It reads the
-- public views, so it runs as the caller and needs no extra privileges.
create or replace function hall_of_fame(p_season_id int default null, p_limit int default 10)
returns table (tab text, profile_id uuid, country_code text, value bigint, kings int)
language sql stable
set search_path = public
as $$
  with board as (
    select b.profile_id,
           sum(b.crowns)::bigint as crowns,
           max(b.longest_seconds)::bigint as longest,
           min(b.shortest_seconds)::bigint as shortest
    from season_leaderboard b
    where p_season_id is null or b.season_id = p_season_id
    group by b.profile_id
  ),
  countries as (
    select c.country_code,
           sum(c.reign_seconds)::bigint as seconds,
           case when p_season_id is null
             then (select count(distinct r.profile_id)::int from public_reigns r
                   where r.country_code = c.country_code and not r.reversed)
             else max(c.kings)
           end as kings
    from country_leaderboard c
    where p_season_id is null or c.season_id = p_season_id
    group by c.country_code
  )
  (select 'longest', profile_id, null::text, longest, null::int from board
   where longest is not null order by longest desc, profile_id limit p_limit)
  union all
  (select 'most', profile_id, null::text, crowns, null::int from board
   where crowns is not null order by crowns desc, profile_id limit p_limit)
  union all
  (select 'shortest', profile_id, null::text, shortest, null::int from board
   where shortest is not null order by shortest, profile_id limit p_limit)
  union all
  (select 'countries', null::uuid, country_code, seconds, kings from countries
   order by seconds desc, country_code limit p_limit)
$$;

grant execute on function hall_of_fame(int, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Foreign keys that grow with the game
-- ---------------------------------------------------------------------------

-- Left alone on purpose: crown_state (one row), achievements (a fixed catalog) and admin_actions
-- (an admin's audit trail, a handful of rows).
create index payments_lock_idx on payments (lock_id);
create index events_season_idx on events (season_id);
create index price_locks_season_idx on price_locks (season_id);
create index profile_achievements_season_idx on profile_achievements (season_id);
