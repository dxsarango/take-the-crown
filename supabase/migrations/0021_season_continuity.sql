-- Season continuity: the crown never closes because a season is missing.
--
-- 1. Provisional seasons for every month between Frost and Day of the Dead (January–October 2027),
--    contiguous with both, with temporary names, no exclusive achievement and Genesis art (the
--    app's season-to-art mapping falls back to it). Day of the Dead moves from id 2 to id 12 so
--    season numbers follow the calendar; rows keep their content, ids only matter for order.
-- 2. rollover_season() moves to the season that starts exactly when the current one ends. If there
--    is none, the current season runs one more month and every admin gets an email.
-- 3. A daily job emails the admins 30 days (app_config) before a season starts without its final
--    name or art.

alter table seasons
  add column name_final boolean not null default true,
  add column art_final boolean not null default true,
  add column ready_alert_at timestamptz;

alter table app_config
  add column season_ready_alert_days int not null default 30 check (season_ready_alert_days between 1 and 180);

-- Frost has placeholder art (decision 40).
update seasons set art_final = false where id = 1;

-- Day of the Dead: id 2 → id 12.
update seasons set slug = 'day-of-the-dead-moving' where id = 2;
insert into seasons (id, slug, name_en, name_es, skin, starts_at, ends_at, exclusive_achievement, exclusive_frame)
select 12, 'day-of-the-dead', name_en, name_es, skin, starts_at, ends_at, exclusive_achievement, exclusive_frame
from seasons where id = 2;
update achievements set season_id = 12 where code = 'remembered';
update profile_achievements set season_id = 12 where season_id = 2 and achievement_code = 'remembered';

-- Seasons 2–11: one per month, January–October 2027.
update seasons set
  slug = 'season-2', name_en = 'January 2027', name_es = 'Enero 2027', skin = 'provisional',
  starts_at = '2027-01-01 00:00+00', ends_at = '2027-02-01 00:00+00',
  exclusive_achievement = null, exclusive_frame = null, name_final = false, art_final = false
where id = 2;

insert into seasons (id, slug, name_en, name_es, skin, starts_at, ends_at, name_final, art_final)
select n,
       'season-' || n,
       (array['January','February','March','April','May','June','July','August','September','October'])[n - 1] || ' 2027',
       (array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre'])[n - 1] || ' 2027',
       'provisional',
       make_timestamptz(2027, n - 1, 1, 0, 0, 0, 'UTC'),
       make_timestamptz(2027, n, 1, 0, 0, 0, 'UTC'),
       false,
       false
from generate_series(3, 11) as n;

-- rollover_season from 0007: the next season is the one that starts when this one ends; with none,
-- this season runs one more month and the admins are emailed instead of the crown closing.
create or replace function rollover_season()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg app_config;
  v_state crown_state;
  v_season seasons;
  v_next seasons;
  v_king uuid;
  v_closed reigns;
begin
  select * into v_cfg from app_config;
  select * into v_state from crown_state where id for update;
  select * into v_season from seasons where id = v_state.season_id;

  if now() < v_season.ends_at then
    return;
  end if;

  select * into v_next from seasons where starts_at = v_season.ends_at and id <> v_season.id order by id limit 1;
  if v_next.id is null then
    update seasons set ends_at = ends_at + interval '1 month' where id = v_season.id returning * into v_season;
    insert into notifications (kind, profile_id, payload)
    select 'season_extended', pp.profile_id, jsonb_build_object('season_id', v_season.id, 'ends_at', v_season.ends_at)
    from profile_private pp
    where pp.is_admin;
    return;
  end if;

  update reigns set ended_at = v_season.ends_at, end_reason = 'season_end'
  where id = v_state.current_reign_id
  returning * into v_closed;

  if v_closed.id is not null then
    perform award_guardian(v_closed.profile_id, v_closed.duration_seconds, v_closed.id);
  end if;

  update price_locks set status = 'expired' where id = v_state.active_lock_id and status = 'active';

  select profile_id into v_king
  from reigns
  where season_id = v_season.id
  group by profile_id
  order by sum(duration_seconds) desc
  limit 1;

  update seasons set king_profile_id = v_king, closed_at = now() where id = v_season.id;

  update crown_state
  set season_id = v_next.id,
      current_reign_id = null,
      base_price_cents = v_cfg.floor_cents,
      base_set_at = now(),
      active_lock_id = null,
      active_lock_expires_at = null,
      updated_at = now()
  where id;

  insert into events (kind, season_id, profile_id, payload)
  values ('season_ended', v_season.id, v_king, jsonb_build_object('slug', v_season.slug));

  insert into events (kind, season_id, payload)
  values ('season_started', v_next.id, jsonb_build_object('slug', v_next.slug));

  insert into notifications (kind, profile_id, payload)
  select 'season_started', pp.profile_id, jsonb_build_object('season_id', v_next.id, 'slug', v_next.slug)
  from profile_private pp
  join profiles p on p.id = pp.profile_id
  where pp.alerts_season_start and not p.is_banned;
end $$;

-- Emails the admins once per season, season_ready_alert_days before it starts, if its name or art
-- is not final yet. Moving a season's dates (launch_game) sends it again for the new dates.
create or replace function queue_season_readiness_alerts()
returns void
language sql security definer set search_path = public
as $$
  with due as (
    update seasons s
    set ready_alert_at = now()
    from app_config c
    where s.ready_alert_at is null
      and not (s.name_final and s.art_final)
      and s.starts_at > now()
      and s.starts_at <= now() + make_interval(days => c.season_ready_alert_days)
    returning s.id, s.slug, s.starts_at, s.name_final, s.art_final
  )
  insert into notifications (kind, profile_id, payload)
  select 'season_not_ready', pp.profile_id, jsonb_build_object(
    'season_id', d.id, 'slug', d.slug, 'starts_at', d.starts_at, 'name_final', d.name_final, 'art_final', d.art_final
  )
  from due d
  cross join profile_private pp
  where pp.is_admin;
$$;

revoke execute on function queue_season_readiness_alerts() from public, anon, authenticated;

select cron.schedule('season-readiness', '0 9 * * *', 'select public.queue_season_readiness_alerts()');

-- launch_game from 0020, plus: moved seasons get their readiness email again.
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
  set starts_at = p.starts_at, ends_at = p.ends_at, closed_at = null, king_profile_id = null, ready_alert_at = null
  from launch_plan(p_starts_at) p
  where p.season_id = s.id;
  update crown_state
  set season_id = 0, base_price_cents = v_cfg.floor_cents, base_set_at = p_starts_at, updated_at = now()
  where id;

  update app_config set prelaunch = false, updated_at = now();
end $$;
