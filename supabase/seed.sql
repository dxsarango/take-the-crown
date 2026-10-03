-- Local development only. `supabase db reset` runs this after the migrations; it is never pushed
-- to hosted projects. Production season dates are set at deploy (see docs/PROGRESS.md).
--
-- Opens the current season now, so the crown can be taken in development and tests even before
-- the real launch date.
update seasons
set starts_at = now() - interval '1 day'
where id = (select season_id from crown_state)
  and starts_at > now() - interval '1 day';

-- Local development and tests play the launched game; prelaunch is tested on its own.
update app_config set prelaunch = false;
