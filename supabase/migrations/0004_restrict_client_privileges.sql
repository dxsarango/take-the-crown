-- Supabase grants anon and authenticated every privilege on new tables, views and functions.
-- RLS blocked most writes, but not TRUNCATE, and public_reigns is an auto-updatable view that runs
-- with its owner's rights, so anon could rewrite reigns through it. Clients get SELECT on public
-- data only; every write goes through the service role.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on
  app_config, seasons, profiles, crown_state, achievements, profile_achievements, events,
  public_reigns, profile_stats, achievement_stats, season_leaderboard, country_leaderboard, public_crown_state
to anon, authenticated;

-- Owner-only through the own_read policy.
grant select on profile_private to authenticated;

-- Future objects start closed; grant access explicitly in the migration that creates them.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

-- The public views call these, so clients still need them.
grant execute on function price_at(int, timestamptz, timestamptz), current_price_cents(), rank_for_seconds(bigint)
to anon, authenticated;
