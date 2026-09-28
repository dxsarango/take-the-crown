-- Requires the pg_cron extension (enable it in the Supabase dashboard first).
create extension if not exists pg_cron;

select cron.schedule('rollover-season', '* * * * *', 'select public.rollover_season()');
select cron.schedule('live-achievements', '* * * * *', 'select public.check_live_achievements()');

alter publication supabase_realtime add table crown_state, events;
