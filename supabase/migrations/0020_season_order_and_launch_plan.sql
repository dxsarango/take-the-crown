-- Production season order (M10a): Genesis runs until 2026-12-01, Frost becomes season 1 in
-- December 2026 with its own exclusive achievement and frame (placeholder art until the design
-- ships it), and Day of the Dead moves to November 2027 as season 2, keeping its art and
-- "remembered". Rows keep their ids, so nothing that points at a season moves; only their content
-- does. Seasons between January and October 2027 are added before Frost ends.

update seasons set ends_at = '2026-12-01 00:00+00' where id = 0;

-- Slugs are unique: park both before swapping.
update seasons set slug = slug || '-moving' where id in (1, 2);
update seasons set
  slug = 'frost', name_en = 'Frost', name_es = 'Escarcha', skin = 'frost',
  starts_at = '2026-12-01 00:00+00', ends_at = '2027-01-01 00:00+00',
  exclusive_achievement = 'frostbound', exclusive_frame = 'frost'
where id = 1;
update seasons set
  slug = 'day-of-the-dead', name_en = 'Day of the Dead', name_es = 'Día de Muertos', skin = 'day-of-the-dead',
  starts_at = '2027-11-01 00:00+00', ends_at = '2027-12-01 00:00+00',
  exclusive_achievement = 'remembered', exclusive_frame = 'day-of-the-dead'
where id = 2;

update achievements set season_id = 2, sort_order = 202 where code = 'remembered';
insert into achievements (code, rarity, season_id, sort_order) values ('frostbound', 'seasonal', 1, 201);

-- ---------------------------------------------------------------------------
-- Launch plan: Genesis starts at launch and lasts at least min_first_season_days. Launching late
-- extends it, and every later season moves by the same amount, keeping its length.
-- ---------------------------------------------------------------------------

alter table app_config
  add column min_first_season_days int not null default 14 check (min_first_season_days between 1 and 90);

create or replace function launch_plan(p_starts_at timestamptz)
returns table (season_id int, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public
as $$
  with genesis as (
    select s.ends_at as old_end,
           greatest(s.ends_at, p_starts_at + make_interval(days => c.min_first_season_days)) as new_end
    from seasons s, app_config c
    where s.id = 0
  )
  select s.id,
         case when s.id = 0 then p_starts_at else s.starts_at + (g.new_end - g.old_end) end,
         s.ends_at + (g.new_end - g.old_end)
  from seasons s, genesis g
  order by s.id;
$$;

revoke execute on function launch_plan(timestamptz) from public, anon, authenticated;

-- launch_game from 0019, with the season dates from launch_plan.
create or replace function launch_game(p_starts_at timestamptz)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg app_config;
begin
  select * into v_cfg from app_config for update;
  if not v_cfg.prelaunch then
    raise exception 'not_prelaunch';
  end if;
  if p_starts_at < now() - interval '1 minute' then
    raise exception 'starts_in_past';
  end if;
  perform 1 from crown_state where id for update;

  update crown_state set current_reign_id = null, active_lock_id = null, active_lock_expires_at = null where id;
  delete from reports;
  delete from events;
  delete from profile_achievements;
  delete from rank_ups;
  delete from notifications;
  delete from reigns;
  delete from payments;
  delete from webhook_events;
  delete from price_locks;
  delete from rate_limit_hits;

  update seasons s
  set starts_at = p.starts_at, ends_at = p.ends_at, closed_at = null, king_profile_id = null
  from launch_plan(p_starts_at) p
  where p.season_id = s.id;
  update crown_state
  set season_id = 0, base_price_cents = v_cfg.floor_cents, base_set_at = p_starts_at, updated_at = now()
  where id;

  update app_config set prelaunch = false, updated_at = now();
end $$;
